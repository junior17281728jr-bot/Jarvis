// Academia 0.12.7: la IA solo trabaja cuando alguien estudia, y piensa en la PRÓXIMA clase del alumno.
//  (a) un día entero sin nadie estudiando, con la IA encendida y el trabajo automático de verdad: 0 llamadas;
//  (b) «Preparar tu próxima clase»: al terminar una sesión, UNA tarea (Haiku 5.5, prefijo cacheable sin la clave del
//      Test Guide, sin el nombre del alumno, sin cobrarle usos); como mucho una por día; sin cambios, nada;
//  (c) la revisión: tarjetas inventadas fuera; citar o decir la respuesta de una pregunta que no respondió, no sirve;
//  (d) «Apagar la IA» y el interruptor «Preparar la próxima clase» la paran (también una que ya estaba en la fila).
// Siempre contra el proveedor FALSO: nunca una clave ni una API de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, pedidosIa, cuerpoDe, datosDe, DE, NOMBRES, mala, nuevo, SILENCIO } from './instructor-ia-base.js';
import { guardarConfigIa } from '../src/ia/config.js';
import { saldoIa } from '../src/academia/tiempo-ia.js';
import { revisarRespuesta } from '../src/academia/instructor-ia.js';
import { crearEjecutor } from '../src/tareas/ejecutor.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { nuevaCorrida } from '../src/tareas/corridas.js';
import { TIPOS, PROGRAMAS_DEL_SISTEMA } from '../src/tareas/tipos.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';

const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const tareasPreparar = c => c.db.prepare("SELECT * FROM tareas WHERE tipo = 'academia.instructor' AND datos LIKE '%instructor_preparar%' ORDER BY id").all();
const preparadoFalso = (extra = {}) => ({
  tipo: 'ok',
  json: { intro: 'Hoy vemos la hipoxia: ya te costó una vez, vamos con calma.', tarjetas: [{ tarjeta: 't1', porque: 'Explica tu error.' }, { tarjeta: 't99', porque: 'inventada' }], analogias: [{ idea: 'que se siente enseguida', analogia: 'Como subir una montaña sin darte cuenta.' }], plan: ['Lee la t1.', 'Responde las del tema.', 'Repasa en Mi repaso.'], cita_test_guide: [], ...extra },
});
// Responde mal una pregunta del tema 1 y «cierra la app» (fin de la sesión).
async function estudiarYSalir(c, galleta) {
  const i = (await nuevo(c, galleta, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
  const q = i.preguntas[0];
  assert.equal((await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: mala(q.id) } })).codigo, 200);
  assert.equal((await pedir(c.base, 'POST', '/api/yo/visita/fin', { galleta, datos: {} })).codigo, 200);
  return q;
}

test('(a) un día entero sin nadie estudiando: el trabajo automático de verdad (vigilar, base, copias, Drive) nunca llama a la IA', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    // Estudió hace 3 días (más de 48 h): nada de eso puede despertar a la IA hoy.
    c.db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, empezado_en) VALUES (?, 'tema', 'factores_humanos', 'muestra-hipoxia', ?)").run(z, new Date(Date.now() - 3 * 86_400_000).toISOString());
    let ahora = Date.parse('2026-11-12T04:00:00Z');
    const corrida = nuevaCorrida(c.db, { version: 'prueba', codigo: 'prueba' });
    const ejecutor = crearEjecutor({
      db: c.db, config: c.config, corrida, escritor: crearEscritor(c.db, { registro: SILENCIO, dormir: async () => {} }), registro: TIPOS, manejadores: MANEJADORES,
      tiempos: { rssMaxMb: 1e9 }, programas: PROGRAMAS_DEL_SISTEMA, memoriaDisponibleMb: () => 1000, discoLibreMb: () => 100_000, pedirSalida: () => {}, log: SILENCIO,
      reloj: () => ahora,
    });
    const llamadasAntes = c.db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n;
    for (let paso = 0; paso < 24 * 12; paso++) { // cada 5 minutos durante 24 horas
      ahora += 5 * 60_000;
      await ejecutor.ciclo();
    }
    await ejecutor.parar({ esperaMs: 100 });
    const programadas = c.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE programa IS NOT NULL").get().n;
    assert.ok(programadas >= 24, `el trabajo automático sí corrió (${programadas} tareas programadas)`);
    assert.equal(c.falso.peticiones.length, 0, 'ni un pedido al proveedor (ni siquiera a count_tokens)');
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, llamadasAntes, 'ninguna llamada nueva en el libro de gastos');
    assert.equal(tareasPreparar(c).length, 0, 'ninguna preparación sin alguien estudiando');
  });
});

test('(b) al terminar una sesión: UNA preparación (Haiku, prefijo cacheable sin la clave del Test Guide ni el nombre), sin cobrar usos; una por día', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    const saldo = saldoIa(c.db, z).minutos;
    const q = await estudiarYSalir(c, c.z);
    const [t] = tareasPreparar(c);
    assert.ok(t, 'quedó una tarea de preparación');
    assert.equal(saldoIa(c.db, z).minutos, saldo, 'no le cobra usos');
    c.falso.siguiente({ ...preparadoFalso(), uso: { input_tokens: 400, cache_read_input_tokens: 1600 } });
    const hecha = await c.hacer(t.id);
    assert.equal(hecha.resultado.usada, true, JSON.stringify(hecha.resultado));
    const cuerpo = cuerpoDe(pedidosIa(c).at(-1));
    assert.equal(cuerpo.model, 'claude-haiku-5-5', 'la preparación usa el modelo barato aunque el instructor use Sonnet');
    assert.ok(Array.isArray(cuerpo.system) && cuerpo.system[0].cache_control?.type === 'ephemeral', 'el prefijo va marcado para la caché de 5 minutos');
    const sistema = cuerpo.system[0].text;
    const correcta = DE(q.id).original.opciones.find(o => o.letra === DE(q.id).original.correcta).texto;
    assert.ok(sistema.includes(DE(q.id).original.enunciado), 'la pregunta del Test Guide va TAL CUAL en el prefijo');
    const material = datosDe(sistema);
    assert.ok(material.preguntas_del_test_guide.length >= 1);
    assert.ok(material.preguntas_del_test_guide.every(x => Object.keys(x).sort().join() === 'enunciado,numero,opciones'), 'el prefijo compartido nunca lleva la clave');
    const alumno = datosDe(cuerpo.messages[0].content);
    assert.equal(alumno.preguntas_que_fallo[0].respuesta_del_test_guide, correcta, 'solo de la que ya falló va la respuesta');
    assert.ok(alumno.preguntas_sin_responder.length >= 1);
    for (const n of NOMBRES) assert.ok(!JSON.stringify(cuerpo).toLowerCase().includes(n), `nunca su nombre (${n})`);
    // Al abrir ese tema: «Preparado para ti», con la tarjeta de verdad (la inventada se descartó).
    const r = (await pedir(c.base, 'GET', '/api/academia/instructor/preparado/factores_humanos/muestra-hipoxia', { galleta: c.z })).datos;
    assert.equal(r.ia.estado, 'lista');
    assert.deepEqual(r.ia.tarjetas.map(x => x.tarjeta), ['t1']);
    assert.equal(r.ia.plan.length, 3);
    assert.ok(r.basico.tarjetas >= 1);
    // El dueño lo ve en «IA y gastos»: hoy, por tipo, la caché y «0 llamadas cuando nadie estudia».
    const ia = (await pedir(c.base, 'GET', '/api/admin/ia', { galleta: c.admin })).datos;
    assert.equal(ia.prepararClase, true);
    assert.deepEqual(ia.uso.hoy.porTipo.map(x => [x.proposito, x.n]), [['instructor_preparar', 1]]);
    assert.equal(ia.uso.cache.pct, 80);
    assert.equal(ia.uso.sinPersona, 0);
    // Otra sesión el mismo día: nada nuevo.
    await estudiarYSalir(c, c.z);
    assert.equal(tareasPreparar(c).length, 1, 'como mucho una por día');
    // Quirino no estudió: nada para él.
    assert.equal(tareasPreparar(c).filter(x => x.creada_por === idDe(c, 'quirino')).length, 0);
    // Al día siguiente, si nada cambió desde la última, tampoco (la huella es la misma).
    c.db.prepare("UPDATE ajustes SET valor = json_set(valor, '$.dia', '2000-01-01') WHERE clave = ?").run(`academia.preparar.ultimo.${z}`);
    assert.equal((await pedir(c.base, 'POST', '/api/yo/visita/fin', { galleta: c.z, datos: {} })).codigo, 200);
    assert.equal(tareasPreparar(c).length, 1, 'sin estudiar nada nuevo, no se prepara otra');
  });
});

test('(c) la revisión: decir o citar la respuesta de una que no respondió no sirve; contradecir una fallada tampoco', () => {
  const datos = { uso: 'instructor_preparar', tarjetas: ['t1', 't2'], citas: [{ numero: 'M-01', correcta: 'Oxígeno suficiente.', otras: ['Agua suficiente.'] }], sinResponder: [{ numero: 'M-02', opciones: ['Usar oxígeno o bajar', 'Seguir subiendo', 'Comer algo'] }], tema: 'f/t' };
  const base = { intro: 'Hola', tarjetas: [{ tarjeta: 't2', porque: 'x' }, { tarjeta: 'tx', porque: 'y' }], analogias: [], plan: ['a', 'b', 'c'], cita_test_guide: [] };
  assert.deepEqual(revisarRespuesta(datos, base).tarjetas, [{ tarjeta: 't2', porque: 'x' }]);
  const no = j => assert.throws(() => revisarRespuesta(datos, { ...base, ...j }), e => e.clave === 'no_se_pudo_guardar');
  no({ cita_test_guide: [{ numero: 'M-02', respuesta: 'Usar oxígeno o bajar' }] });
  no({ intro: 'Ojo: en la M-02 la correcta es usar oxígeno o bajar.' });
  no({ cita_test_guide: [{ numero: 'M-01', respuesta: 'Agua suficiente.' }] });
  no({ plan: ['solo uno'] });
  assert.deepEqual(revisarRespuesta(datos, { ...base, cita_test_guide: [{ numero: 'M-01', respuesta: 'oxigeno suficiente' }] }).citas, [{ numero: 'M-01', respuesta: 'Oxígeno suficiente.' }]);
});

test('(d) «Apagar la IA» y «Preparar la próxima clase con IA» la paran: no se pone nada en la fila y la que esperaba no llama', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    await estudiarYSalir(c, c.z);
    const [t] = tareasPreparar(c);
    assert.ok(t);
    // Apagar toda la IA con la tarea ya en la fila: termina sin llamar.
    assert.equal((await pedir(c.base, 'POST', '/api/admin/ia/apagar', { galleta: c.admin, datos: {} })).codigo, 200);
    const hecha = await c.hacer(t.id);
    assert.deepEqual([hecha.resultado.usada, hecha.resultado.motivo], [false, 'ia_apagada']);
    assert.equal(pedidosIa(c).length, 0);
    // Con la IA otra vez encendida pero el interruptor apagado: nada en la fila.
    guardarConfigIa(c.db, { encendida: true }, { config: c.config, usuarioId: c.adminId });
    const r = await pedir(c.base, 'POST', '/api/admin/ia/ajustes', { galleta: c.admin, datos: { prepararClase: false } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    c.db.prepare('DELETE FROM ajustes WHERE clave = ?').run(`academia.preparar.ultimo.${z}`);
    await estudiarYSalir(c, c.z);
    assert.equal(tareasPreparar(c).length, 1, 'con el interruptor apagado no se prepara');
    assert.equal(pedidosIa(c).length, 0);
  });
});
