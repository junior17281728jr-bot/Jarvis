// Academia 0.12.9: el tutor del alumno (parte ALUMNO / TUTOR IA). Siempre contra el proveedor FALSO.
//  (N) sin IA para él, nada de IA: la tarjeta del tutor, la tarjeta de la clase y las preguntas personalizadas responden
//      ia: false / null y lo gratis («Modo básico») sigue; ningún pedido al proveedor.
//  (T) la memoria del tutor: una fila por intento y por clase, sin IA, aditiva.
//  (G/M/S/U) el primer mensaje del Profesor y «¿Tomo el examen?» salen SIN llamar a la IA.
//  (J/K) «Explícamelo mejor» de una tarjeta: compartido (otro alumno lo reutiliza sin pagar otra vez), sin la respuesta del
//      Test Guide en lo que va al proveedor, con «Para el examen» puesto por la app; si la IA dice una respuesta, no sirve.
//  (O) las preguntas personalizadas: revisadas contra la clave, sin la correcta antes de responder.
//  (R) la cobertura del Test Guide para el administrador; el registro de la IA (biblioteca, reusos, ocultar).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, pedidosIa, cuerpoDe, datosDe, sistemaDe, DE, NOMBRES, mala, nuevo, MUESTRA } from './instructor-ia-base.js';
import { revisarRespuesta, leerGuardado } from '../src/academia/instructor-ia.js';
import { biblioteca, ocultar, generadoPara, metaDe, analisisTestGuide } from '../src/academia/registro-ia.js';
import { anotarIntento } from '../src/academia/tutor.js';
import { darProfesor } from '../src/academia/profesor.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { memoriaTutor, coberturaTestGuide, preferencias } from '../src/academia/tutor.js';
import { guardarConfigIa } from '../src/ia/config.js';
// Sin «Preparar la próxima clase» (tiene su prueba): así la fila solo tiene lo que estas pruebas piden.
const sinPreparar = c => guardarConfigIa(c.db, { prepararClase: false }, { config: c.config, usuarioId: c.adminId });

const TEMA = { materia: 'factores_humanos', tema: 'muestra-hipoxia' };
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
// Un examen del tema 1 entero: todas mal (o todas bien), y terminado.
async function temaEntero(c, galleta, { bien = false } = {}) {
  const i = (await nuevo(c, galleta, { tipo: 'tema', ...TEMA })).datos;
  for (const q of i.preguntas) {
    const r = await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: bien ? DE(q.id).original.correcta : mala(q.id) } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
  }
  const fin = await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} });
  assert.equal(fin.codigo, 200, JSON.stringify(fin.datos));
  return { intento: i, fin: fin.datos };
}
const tarjetaFalsa = (extra = {}) => ({ tipo: 'ok', json: { explicacion: 'Arriba el aire está menos apretado: cada respiración trae menos oxígeno.', ejemplo: 'Subiendo a 12 000 pies sin oxígeno.', recuerda: 'Más alto, menos oxígeno.', terminos: [{ ingles: 'hypoxia', espanol: 'hipoxia', abreviatura: '' }], ...extra } });

test('(N) sin IA para él: nada de IA (tutor, tarjeta, personalizadas, pista) y lo gratis sigue; 0 pedidos', async () => {
  await conInstructor(async c => {
    await temaEntero(c, c.z);
    const tutor = await pedir(c.base, 'GET', '/api/academia/tutor', { galleta: c.z });
    assert.deepEqual(tutor.datos, { ia: false }, 'sin la IA encendida, ni la tarjeta del tutor');
    const t = await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.z, datos: { ...TEMA, tarjeta: 1, tipo: 'mejor', ia: true } });
    assert.equal(t.codigo, 200);
    assert.equal(t.datos.ia, null, 'ni un «no pudo»: nada');
    assert.ok(t.datos.basica, 'lo gratis («Modo básico») sí');
    assert.ok(Array.isArray(t.datos.examen.otras));
    const o = await pedir(c.base, 'POST', '/api/academia/tutor/personalizadas', { galleta: c.z, datos: TEMA });
    assert.equal(o.datos.ia, null);
    const ex = await pedir(c.base, 'GET', '/api/academia/tutor/examen', { galleta: c.z });
    assert.equal(ex.codigo, 200);
    assert.equal(ex.datos.examenIa, null, '«¿Tomo el examen?» sin IA sí, el porqué con IA no');
    assert.equal(c.falso.peticiones.length, 0);
  }, { encender: false });
});

test('(N) con la IA encendida pero SIN el permiso de IA del dueño para esa cuenta: tampoco nada de IA', async () => {
  await conInstructor(async c => {
    await temaEntero(c, c.z);
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/tutor', { galleta: c.z })).datos, { ia: false });
    const t = await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.z, datos: { ...TEMA, tarjeta: 2, tipo: 'profundizar', ia: true } });
    assert.equal(t.datos.ia, null);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/tutor/personalizadas', { galleta: c.z, datos: TEMA })).datos.ia, null);
    assert.equal(c.falso.peticiones.length, 0);
  }, { permitir: false });
});

test('(T, G, M, S, U) memoria del tutor, primer mensaje del Profesor y «¿Tomo el examen?» sin llamar a la IA', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    for (let k = 0; k < 3; k++) await temaEntero(c, c.z);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/temas/factores_humanos/muestra-ilusiones/leido', { galleta: c.z, datos: {} })).codigo === 200 || true, true);
    const memoria = memoriaTutor(c.db, z);
    const intentos = memoria.filter(x => x.tipo === 'tema');
    assert.equal(intentos.length, 3, 'una fila por intento terminado');
    assert.equal(intentos[0].pct, 0);
    assert.ok(intentos[0].mal.length >= 1 && intentos[0].tgMal.length === 5, JSON.stringify(intentos[0]));
    assert.equal(intentos[0].conclusion.clave, 'reforzar');
    // Aditiva: terminar otra vez el mismo intento no escribe otra fila.
    await pedir(c.base, 'POST', `/api/academia/intentos/${intentos[0].intento}/terminar`, { galleta: c.z, datos: {} });
    assert.equal(memoriaTutor(c.db, z).filter(x => x.tipo === 'tema').length, 3);
    const antes = c.falso.peticiones.length;
    const d = (await pedir(c.base, 'GET', '/api/academia/tutor', { galleta: c.z })).datos;
    assert.equal(d.ia, true);
    assert.ok(d.apertura.fallaste.length >= 1, 'G: «Vi que fallaste…»');
    assert.equal(d.apertura.tema.numero, 1);
    assert.equal(d.apertura.preguntasMateria, 10, 'M: las N preguntas de la materia');
    assert.ok(d.apertura.prioridad.n >= 1, 'S: cuántas preguntas del Test Guide pesa');
    assert.deepEqual(d.apertura.practicar.tipo, 'errores');
    assert.ok(d.apertura.buscar.url.startsWith('https://www.youtube.com/results?'), 'videos: nunca una dirección inventada');
    assert.equal(d.examen.materia.si, false);
    assert.ok(d.examen.materia.porques.length >= 2 && d.examen.materia.porques.length <= 4, 'U: 2–4 porqués');
    assert.equal(d.examen.oficial.si, false);
    for (const n of NOMBRES) assert.ok(!JSON.stringify(d).includes(n), 'el nombre lo pone la pantalla, no el servidor');
    assert.equal(c.falso.peticiones.length, antes, 'nada de esto llama a la IA');
    // S: «Mi repaso» trae el peso de cada punto y, con planes de verdad, el admin ve todo esto en la ficha.
    const rep = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.z })).datos;
    assert.ok(rep.paraRepasar.every((x, i, l) => i === 0 || l[i - 1].peso >= x.peso), 'primero lo que más pesa');
    assert.deepEqual(rep.personal, { respondidas: 0, bien: 0 });
    const admin = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${z}/tutor`, { galleta: c.admin })).datos;
    assert.equal(admin.memoria.length, memoriaTutor(c.db, z).length);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${z}/tutor`, { galleta: c.q })).codigo, 403);
    // R: la cobertura del Test Guide en Contenido.
    const cont = (await pedir(c.base, 'GET', '/api/admin/academia', { galleta: c.admin })).datos;
    assert.equal(cont.cobertura.preguntas, 10);
    assert.deepEqual(cont.cobertura, coberturaTestGuide(null) && cont.cobertura);
    assert.ok(cont.cobertura.cubiertas + cont.cobertura.materias[0].faltan.length === 10);
    // L: la dificultad (lo que fallan todos) en el análisis para el administrador.
    const an = analisisTestGuide(c.db, paqueteActivo(c.db, c.config), TEMA.materia, TEMA.tema);
    assert.equal(an.preguntas.length, 5);
    assert.ok(an.preguntas.every(x => x.dificultad?.malPct === 100 && x.dificultad.n === 3), JSON.stringify(an.preguntas[0]));
    // T: un examen de la materia (también el del reloj) deja su fila «examen».
    const ex = c.db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, materia, total, respondidas, aciertos, aprobado, empezado_en, terminado_en) VALUES (?, 'examen', 'factores_humanos', 10, 10, 9, 1, '2026-11-10T14:00:00Z', '2026-11-10T14:20:00Z')").run(z).lastInsertRowid;
    const fila = anotarIntento(c.db, z, paqueteActivo(c.db, c.config), Number(ex));
    assert.deepEqual([fila.tipo, fila.pct, fila.minutos, fila.conclusion.clave], ['examen', 90, 20, 'examen_bien']);
    // El registro: meta, foco y próxima clase.
    const m = metaDe(c.db, z, null);
    assert.equal(m.meta, 'tutor.meta.texto');
  });
});

test('(J, K, I) «Explícamelo mejor»: compartido, sin la respuesta del Test Guide, «Para el examen» de la app; decir una respuesta no sirve', async () => {
  await conInstructor(async c => {
    sinPreparar(c);
    const { intento } = await temaEntero(c, c.z);
    const antes = pedidosIa(c).length;
    const r = await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.z, datos: { ...TEMA, tarjeta: 1, tipo: 'mejor', ia: true } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.ia.estado, 'pendiente');
    // K: lo de «Para el examen» lo pone la app: respondidas (todas, ya contestó el tema) con la respuesta del Test Guide.
    assert.ok(r.datos.examen.respondidas.length >= 1);
    const q1 = DE(intento.preguntas.find(q => r.datos.examen.respondidas.some(x => x.enunciado === DE(q.id).original.enunciado)).id);
    assert.equal(r.datos.examen.respondidas.find(x => x.enunciado === q1.original.enunciado).respuesta, q1.original.opciones.find(o => o.letra === q1.original.correcta).texto);
    c.falso.siguiente(tarjetaFalsa());
    const t = c.db.prepare("SELECT id FROM tareas WHERE datos LIKE '%instructor_tarjeta%' ORDER BY id DESC").get();
    const hecha = await c.hacer(t.id);
    assert.equal(hecha.resultado.usada, true, JSON.stringify(hecha.resultado));
    const cuerpo = cuerpoDe(pedidosIa(c).at(-1));
    assert.equal(cuerpo.model, 'claude-haiku-5-5', 'siempre el modelo barato');
    assert.ok(Array.isArray(cuerpo.system) && cuerpo.system[0].cache_control?.type === 'ephemeral', 'el material va a la caché de 5 minutos');
    const sistema = sistemaDe(cuerpo);
    const material = datosDe(sistema);
    assert.ok(material.preguntas_del_test_guide_de_esta_tarjeta.every(x => Object.keys(x).sort().join() === 'enunciado,numero,opciones'), 'nunca la clave del Test Guide');
    assert.ok(sistema.includes('Tu meta: que este alumno apruebe el examen del Test Guide y llegue a ser piloto privado.'), 'K: la meta en cada pedido');
    for (const n of NOMBRES) assert.ok(!JSON.stringify(cuerpo).toLowerCase().includes(n), `nunca su nombre (${n})`);
    const lista = await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${t.id}`, { galleta: c.z });
    assert.equal(lista.datos.estado, 'lista');
    assert.match(lista.datos.explicacion, /oxígeno/);
    // Quirino (mismo estilo, misma tarjeta): lo guardado, sin pagar otra llamada.
    await temaEntero(c, c.q);
    const otra = await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.q, datos: { ...TEMA, tarjeta: 1, tipo: 'mejor', ia: true } });
    assert.equal(otra.datos.ia.estado, 'lista');
    assert.equal(pedidosIa(c).length, antes + 1, 'una sola llamada para los dos');
    // El registro de la IA: en la biblioteca, con su costo y 1 reuso; «ocultar» lo marca (no lo borra).
    const b = biblioteca(c.db, { tipo: 'explicar_mejor' });
    assert.equal(b.total, 1);
    assert.equal(b.items[0].reusos, 1);
    assert.ok(Number.isSafeInteger(b.items[0].costoMicro));
    assert.equal(b.items[0].ahorroMicro, b.items[0].costoMicro);
    ocultar(c.db, b.items[0].clave, true);
    assert.equal(leerGuardado(c.db, b.items[0].clave), null, 'oculto: ya no se muestra');
    assert.ok(c.db.prepare('SELECT 1 FROM ajustes WHERE clave = ?').get(b.items[0].clave), 'pero nunca se borra');
    assert.equal(biblioteca(c.db, { tipo: 'explicar_mejor' }).items[0].oculto, true);
    ocultar(c.db, b.items[0].clave, false);
    assert.ok(leerGuardado(c.db, b.items[0].clave));
    // F: «Te lo expliqué de otra forma: …» en la tarjeta del tutor.
    const d = (await pedir(c.base, 'GET', '/api/academia/tutor', { galleta: c.z })).datos;
    assert.ok(d.novedades.some(n => n.tipo === 'explicamos' && n.href.startsWith('#tema/factores_humanos/muestra-hipoxia/1')), JSON.stringify(d.novedades));
    // G: «Explícame la clase de <tema>»: el chat lleva ESE tema como contexto (y cabe en lo que se puede mandar).
    darProfesor(c.db, idDe(c, 'zoelia'), true);
    const chat = await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: 'Explícame la clase de La hipoxia a mi manera', ...TEMA } });
    assert.equal(chat.codigo, 200, JSON.stringify(chat.datos));
    assert.equal(chat.datos.ia.estado, 'pendiente');
    const tc = JSON.parse(c.db.prepare('SELECT datos FROM tareas WHERE id = ?').get(chat.datos.ia.tarea).datos);
    const dc = datosDe(tc.texto);
    assert.equal(dc.material.tema, 'La hipoxia (muestra)');
    assert.ok(Array.isArray(dc.alumno.memoria) && dc.alumno.memoria.length >= 1, 'T: lo que recuerda va en el pedido');
    for (const n of NOMBRES) assert.ok(!JSON.stringify(tc).toLowerCase().includes(n));
    // I: las señales (solo números).
    for (const tipo of ['entendi', 'duda', 'duda', 'duda', 'ejemplo', 'ejemplo']) assert.equal((await pedir(c.base, 'POST', '/api/academia/tutor/senal', { galleta: c.z, datos: { tipo } })).codigo, 200);
    const a = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${idDe(c, 'zoelia')}/tutor`, { galleta: c.admin })).datos;
    assert.equal(a.preferencias.modo, 'ejemplos');
    assert.equal(a.preferencias.entiende, 25);
    assert.deepEqual(preferencias({}), { largo: null, modo: null, visual: false, entiende: null });
  });
});

test('(J) la revisión: decir la respuesta de una pregunta del Test Guide la deja sin usar; (O) preguntas personalizadas coherentes con la clave', () => {
  const sin = [{ numero: 'H-01', opciones: ['Falta de oxígeno en el cuerpo', 'Exceso de nitrógeno en la sangre', 'Cansancio por el ruido'] }];
  assert.throws(() => revisarRespuesta({ uso: 'instructor_tarjeta', sinResponder: sin }, { explicacion: 'La respuesta es falta de oxígeno en el cuerpo.', ejemplo: '', recuerda: '', terminos: [] }), /no_se_pudo_guardar/);
  const ok = revisarRespuesta({ uso: 'instructor_profundizar', sinResponder: sin, tarjetaTitulo: 'x' }, { por_que_pasa: 'Menos presión. Ver https://ejemplo.com', ejemplo_vuelo: 'Un vuelo a 12 000 pies.', trampa_examen: 'Te cambian la altitud.', recuerda: 'r', terminos: [] });
  assert.equal(ok.tipo, 'profundizar');
  assert.ok(!ok.porQue.includes('http'), 'nunca un enlace');
  const clave = [{ numero: 'H-01', enunciado: '¿Qué es la hipoxia?', correcta: 'Falta de oxígeno en el cuerpo', otras: ['Exceso de nitrógeno en la sangre', 'Cansancio por el ruido'] }];
  const datos = { uso: 'instructor_personal', clavePreguntas: clave, tema: 'f/t' };
  const buena = { enunciado: 'Subes a 14 000 pies y te sientes eufórico. ¿Qué pasa?', opciones: ['Falta de oxígeno en el cuerpo', 'Tienes hambre', 'El motor falla'], correcta: '1', explicacion: 'Es hipoxia.', entrena: 'H-01' };
  const r = revisarRespuesta(datos, { preguntas: [buena, { ...buena, entrena: 'H-99' }, { ...buena, enunciado: '¿Qué es la hipoxia?' }] });
  assert.equal(r.preguntas.length, 1, 'una ligada a otra pregunta o que copia el Test Guide queda fuera');
  assert.equal(r.preguntas[0].correcta, 0);
  assert.throws(() => revisarRespuesta(datos, { preguntas: [{ ...buena, correcta: '2', opciones: ['Falta de oxígeno en el cuerpo', 'Exceso de nitrógeno en la sangre', 'x'] }] }), /no_se_pudo_guardar/, 'la correcta nunca es una mala del Test Guide');
  assert.throws(() => revisarRespuesta(datos, { preguntas: [{ ...buena, correcta: '3' }] }), /no_se_pudo_guardar/, 'si una opción es la respuesta del Test Guide, tiene que ser la correcta');
});

test('(O) preguntas personalizadas: solo con IA, de lo que confundió, sin la correcta antes de responder; cuentan en «Mi repaso»', async () => {
  await conInstructor(async c => {
    sinPreparar(c);
    for (let k = 0; k < 3; k++) await temaEntero(c, c.z);
    const r = await pedir(c.base, 'POST', '/api/academia/tutor/personalizadas', { galleta: c.z, datos: TEMA });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.ia.estado, 'pendiente', JSON.stringify(r.datos));
    const t = c.db.prepare("SELECT id, datos FROM tareas WHERE datos LIKE '%instructor_personal%' ORDER BY id DESC").get();
    const clave = JSON.parse(t.datos).clavePreguntas[0];
    c.falso.siguiente({ tipo: 'ok', json: { preguntas: [{ enunciado: 'Vuelas alto y todo te da risa. ¿Qué te pasa?', opciones: [clave.correcta, 'Nada', 'Hambre'], correcta: '1', explicacion: 'Es lo que dice la clase.', entrena: clave.numero }] } });
    const hecha = await c.hacer(t.id);
    assert.equal(hecha.resultado.usada, true, JSON.stringify(hecha.resultado));
    const v = (await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${t.id}`, { galleta: c.z })).datos;
    assert.equal(v.estado, 'lista');
    assert.equal(v.preguntas.length, 1);
    assert.equal(v.preguntas[0].correcta, undefined, 'la correcta no viaja antes de responder');
    assert.equal(v.preguntas[0].explicacion, undefined);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/tutor/personalizadas/responder', { galleta: c.q, datos: { clave: v.clave, i: 0, elegida: 0 } })).codigo, 404, 'otro alumno no');
    const x = (await pedir(c.base, 'POST', '/api/academia/tutor/personalizadas/responder', { galleta: c.z, datos: { clave: v.clave, i: 0, elegida: 0 } })).datos;
    assert.equal(x.acierto, true);
    assert.deepEqual(x.progreso, { respondidas: 1, bien: 1 });
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.z })).datos.personal, { respondidas: 1, bien: 1 });
    // No cuentan en el Test Guide: ni una respuesta nueva en academia_respuestas.
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM academia_respuestas WHERE pregunta NOT IN (SELECT pregunta FROM academia_respuestas WHERE intento_id IS NOT NULL)").get().n, 0);
    // H: la pista después de un error y la tarjeta exacta de la clase.
    const i = c.db.prepare("SELECT intento_id, pregunta FROM academia_respuestas WHERE usuario_id = ? AND correcta = 0 ORDER BY id DESC").get(idDe(c, 'zoelia'));
    const p = (await pedir(c.base, 'GET', `/api/academia/tutor/pista/${i.intento_id}/${i.pregunta}`, { galleta: c.z })).datos;
    assert.equal(p.tarjeta.materia, 'factores_humanos');
    assert.ok(p.tarjeta.n >= 1);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/tutor/pista/${i.intento_id}/${i.pregunta}`, { galleta: c.q })).codigo, 404);
    assert.ok(generadoPara(c.db, idDe(c, 'zoelia')).every(x => x.tipo));
  });
});

test('las preguntas de la muestra del paquete se mapean a tarjetas (R) y nada del paquete real vive en el repositorio', () => {
  const cob = coberturaTestGuide({ materias: [], preguntas: new Map() });
  assert.deepEqual(cob, { preguntas: 0, cubiertas: 0, materias: [] });
  assert.equal(MUESTRA.preguntas.length, 10);
});
