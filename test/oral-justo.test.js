// Academia 0.14.93 (lo reportó el dueño: en la «Práctica en vivo» del oral, a la repregunta «¿Qué nubes se forman en un
// frente frío y qué le pasa a la temperatura y la presión durante su paso?» le dijeron «Casi: la presión baja rápido, NO
// sube después; también faltaron la visibilidad y los vientos». Las dos cosas estaban mal: la FAA (PHAK) dice que la
// presión baja, toca fondo en el paso y después sube; y la repregunta no preguntaba por la visibilidad ni el viento).
//  - Una repregunta se califica SOLO contra lo que pide: con la IA (sus puntos van en el pedido) y con el sistema.
//  - Nunca se marca mal un dato correcto de la FAA: la respuesta del libro es un resumen (en las reglas de la IA); el
//    sistema no resta por decir además el antes y el después (sube / baja).
//  - Lo aprendido de una calificación mala se RETIRA (nunca se borra) al confirmar un reporte y desde el administrador.
//  - «Casi» se lee bien en claro y en oscuro.
// El paquete de la pregunta del frente frío es de muestra (con nuestras palabras); el resto, el de siempre (inventado).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { conInstructor, pedir, pedidosIa, cuerpoDe, sistemaDe, datosDe } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { abrirBase } from '../src/nucleo/db.js';
import { configDePrueba } from './ayuda.js';
import { calificarSistema, focoRepregunta, sugerencia } from '../src/academia/oral-vivo.js';
import { sistemaCalificar, textoCalificar, revisarVivo, ESQUEMA_VIVO, armarCierre } from '../src/academia/oral-vivo-ia.js';
import { aprenderDeIa, ejemplosDe, retirarAprendido, ejemplosAdmin, preguntasAprendidas, normalizar } from '../src/academia/oral-aprende.js';
import { esquemaEstricto } from '../src/ia/proveedores/openai.js';
import { armarRevision } from '../src/academia/reporte-ia.js';
import { puntoParaMandar, puntoVivo } from '../public/reportar-vista.js';
import { clavePausa } from '../src/ia/tope-alumno.js';

const huella = t => createHash('sha256').update(String(t ?? '')).digest('hex').slice(0, 16);
const conBase = fn => { const db = abrirBase(configDePrueba()); try { return fn(db); } finally { db.close(); } };

// La pregunta del frente frío, con la misma forma que la del libro (la respuesta del libro, resumida: «la presión baja rápido»).
const FRENTES = {
  n: 4, pagina: '36',
  pregunta_en: 'What weather would a pilot expect near a cold front? Near a warm front?',
  pregunta_es: '¿Cuáles son las características generales del tiempo que encontraría un piloto al operar cerca de un frente frío? ¿Y de un frente caliente?',
  respuesta_en: 'Cold front: towering cumulus or cumulonimbus, heavy rain with lightning, thunder or hail; tornadoes possible; during passage, poor visibility, winds variable and gusting; temperature/dew point and barometric pressure drop rapidly.\nWarm front: stratiform clouds, drizzle, low ceilings and poor visibility; variable winds; temperature rises.',
  respuesta_es: 'Frente frío: al pasar el frente, el tiempo esperado puede incluir cúmulos de gran desarrollo (towering cumulus) o cumulonimbos, lluvia fuerte con relámpagos, truenos o granizo; puede haber tornados; durante el paso, mala visibilidad, vientos variables y con ráfagas; la temperatura/punto de rocío y la presión barométrica bajan rápido.\nFrente caliente: al pasar el frente, nubes estratiformes, llovizna, techos bajos y mala visibilidad; vientos variables; sube la temperatura.',
  puntos_clave: ['Frío: CB, lluvia fuerte, rayos, granizo, posibles tornados.', 'Frío: temperatura, punto de rocío y presión bajan rápido.', 'Cálido: estratiformes, llovizna, techos bajos, mala visibilidad.', 'Cálido: la temperatura sube.'],
};
const P = { oral: { hay: true, materias: [{ id: 'oral_meteo', temas: [{ id: 't01-frentes', titulo: 'Frentes', libro_qa: [FRENTES] }] }] } };
const IT = { m: 'oral_meteo', t: 't01-frentes', i: 0, h: huella(FRENTES.pregunta_en) };
const PREGUNTA = `oral_meteo/t01-frentes#${IT.h}`;
const REPREGUNTA = '¿Qué tipo de nubes se forman en un frente frío y qué le pasa a la temperatura y la presión durante su paso?';
const PRIMERA = 'Cerca de un frente frío hay tormentas y turbulencia; en un frente caliente, nubes en capas y llovizna.';
// Lo que respondió Junior a la repregunta, tal cual.
const JUNIOR = 'En un frente frío se forman principalmente nubes cumulonimbos, que pueden producir tormentas, lluvias fuertes y turbulencia. Durante su paso, la temperatura baja porque entra aire frío, mientras que la presión atmosférica suele bajar antes de que llegue el frente y subir después de su paso.';
const FUERA = /visibilidad|viento|ráfaga|rafaga|no sube/i;

test('la repregunta se califica solo contra lo que pide: sin la visibilidad ni el viento, y la respuesta de Junior no es «mal» ni le dicen «no sube después»', () => {
  // El foco sin los puntos de la IA: lo que nombra la repregunta (nubes, temperatura, presión) y solo del frente frío.
  const foco = focoRepregunta(FRENTES, { repregunta: REPREGUNTA }).puntos_clave;
  assert.ok(foco.length >= 2, JSON.stringify(foco));
  assert.ok(foco.some(x => /cumulonimbos|cúmulos/i.test(x)), 'las nubes');
  assert.ok(foco.some(x => /presión/i.test(x)), 'la presión');
  for (const x of foco) assert.doesNotMatch(x, /visibilidad|viento|ráfaga|estratiforme|llovizna|sube la temperatura/i, x);
  for (const [que, opciones] of [['sin los puntos de la IA', { repregunta: REPREGUNTA }],
    ['con los puntos de la IA', { repregunta: REPREGUNTA, puntos: ['Cumulonimbos o cúmulos de gran desarrollo', 'La temperatura y el punto de rocío bajan', 'La presión baja rápido durante el paso'] }]]) {
    const g = calificarSistema(P, IT, JUNIOR, { seguimiento: true, previo: PRIMERA, ...opciones });
    assert.equal(g.veredicto, 'bien', `${que}: ${JSON.stringify(g)}`);
    assert.doesNotMatch(`${g.linea} ${g.falto}`, FUERA, que);
  }
  // Repetir las palabras de la repregunta no es responderla, y la dirección contraria no cuenta (nunca «bien»).
  const PUNTOS_IA = ['Cumulonimbos o cúmulos de gran desarrollo', 'La temperatura y el punto de rocío bajan', 'La presión baja rápido durante el paso'];
  for (const texto of ['No sé qué le pasa a la temperatura ni a la presión', 'La temperatura sube y la presión sube']) {
    for (const puntos of [PUNTOS_IA, []]) {
      const g = calificarSistema(P, IT, texto, { seguimiento: true, repregunta: REPREGUNTA, puntos });
      assert.notEqual(g.veredicto, 'bien', `${texto} (${puntos.length ? 'con' : 'sin'} los puntos): ${JSON.stringify(g)}`);
    }
  }
  // Una repregunta que no se responde sigue siendo «mal» (el foco no regala nada); y una a medias, lo que falta es solo de ella.
  assert.equal(calificarSistema(P, IT, 'No me acuerdo de eso', { seguimiento: true, repregunta: REPREGUNTA }).veredicto, 'mal');
  const media = calificarSistema(P, IT, 'Se forman cumulonimbos.', { seguimiento: true, repregunta: REPREGUNTA, puntos: ['Cumulonimbos', 'La temperatura baja', 'La presión baja rápido', 'El punto de rocío baja'] });
  assert.equal(media.veredicto, 'casi');
  assert.doesNotMatch(media.falto, FUERA);
  // Como primera respuesta (contra todo el libro) tampoco es «mal» ni le contradicen la presión.
  const primera = calificarSistema(P, IT, JUNIOR);
  assert.notEqual(primera.veredicto, 'mal', JSON.stringify(primera));
  assert.doesNotMatch(`${primera.linea} ${primera.falto}`, /no sube/i);
});

test('sube / baja: cuenta con cualquier palabra de la misma dirección, y decir además el antes y el después no resta', () => {
  const x = { puntos_clave: ['La presión baja rápido.'] };
  assert.equal(sugerencia('La presión baja muy rápido', x).veredicto, 'bien');
  assert.equal(sugerencia('La presión baja muy rápido y después sube', x).veredicto, 'bien', 'el antes y el después');
  assert.equal(sugerencia('Pressure drops fast', { puntos_clave: ['Pressure falls rapidly.'] }).veredicto, 'bien');
  assert.deepEqual(sugerencia('La presión sube', x).dijo, ['presion'], 'la otra dirección no cuenta como «baja»');
});

test('la IA: el sistema dice que el libro es un resumen y que nunca contradiga a la FAA; la repregunta lleva sus puntos y su alcance; el esquema es estricto', () => {
  const s = sistemaCalificar({ capitulo: 'oral_meteo', qa: [{ n: 't01#1', pregunta_en: FRENTES.pregunta_en, respuesta_en: FRENTES.respuesta_en }] });
  assert.match(s, /RESUMEN/);
  assert.match(s, /coincide con el material de la FAA/);
  assert.match(s, /CLARAMENTE contradice/);
  assert.match(s, /nunca «mal», y nunca afirmes un dato contrario/);
  assert.match(s, /«no sube después»/);
  assert.match(s, /REPREGUNTA \(es_repregunta: true\) se califica SOLO contra lo que ella pregunta/);
  assert.match(s, /repregunta_puntos/);
  // El cierre no lleva las reglas de calificar.
  assert.doesNotMatch(armarCierre({ resumen: { pct: 1 } }).sistema, /RESUMEN corto/);
  const t = datosDe(textoCalificar({ n: 't01#1', respuesta: JUNIOR, repregunta: REPREGUNTA, puntos: ['Las nubes: cumulonimbos', 'La presión baja rápido', ' '] }));
  assert.deepEqual([t.es_repregunta, t.repregunta, t.puntos_esperados], [true, REPREGUNTA, ['Las nubes: cumulonimbos', 'La presión baja rápido']]);
  assert.match(t.alcance, /SOLO lo que pregunta la repregunta/);
  assert.equal(datosDe(textoCalificar({ n: 'x', respuesta: 'a' })).puntos_esperados, undefined);
  assert.ok(ESQUEMA_VIVO.required.includes('repregunta_puntos'));
  assert.ok(esquemaEstricto(ESQUEMA_VIVO));
  assert.deepEqual(revisarVivo({}, { veredicto: 'casi', linea: '', repregunta: '¿Y la presión?', repregunta_puntos: ['La presión baja', '', 'x'.repeat(400), 'a', 'b', 'c'] }).repreguntaPuntos.map(x => x.length), [15, 160, 1, 1]);
  assert.deepEqual(revisarVivo({}, { veredicto: 'bien', linea: '', repregunta: '', repregunta_puntos: ['algo'] }).repreguntaPuntos, [], 'sin repregunta, sin puntos');
});

test('retirar lo aprendido: no cuenta al calificar, nunca se borra, una igual entra nueva, uno por uno y volver a usar', () => conBase(db => {
  // La IA (con las reglas de antes) le dijo «casi … no sube después» a lo de Junior; el sistema lo iba a repetir.
  const g = { veredicto: 'casi', linea: 'Casi.', bienDicho: 'Las nubes.', falto: 'Durante el paso, la presión baja rápido, no sube después. También la mala visibilidad y los vientos.', repregunta: '' };
  assert.equal(aprenderDeIa(db, { it: IT, texto: `${PRIMERA} ${JUNIOR}`, seguimiento: true, g }), true);
  const antes = calificarSistema(P, IT, JUNIOR, { db, seguimiento: true, previo: PRIMERA, repregunta: REPREGUNTA });
  assert.equal(antes.veredicto, 'casi', 'lo aprendido manda mientras no se retire');
  assert.doesNotMatch(`${antes.linea} ${antes.falto} ${antes.bienDicho}`, FUERA, 'en una repregunta, nunca el «te faltó» viejo');
  assert.notEqual(antes.linea, 'Casi.', 'ni la línea vieja de la IA');
  const r = retirarAprendido(db, PREGUNTA, { por: 1, motivo: 'reporte', reporte: 7 });
  assert.deepEqual(r, { pregunta: PREGUNTA, activos: 0, retirados: 1 });
  assert.deepEqual(ejemplosDe(db, IT), [], 'un retirado no cuenta');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_oral_aprendido').get().n, 1, 'nunca se borra');
  const despues = calificarSistema(P, IT, JUNIOR, { db, seguimiento: true, previo: PRIMERA, repregunta: REPREGUNTA });
  assert.equal(despues.veredicto, 'bien');
  assert.equal(despues.aprendido, undefined);
  // La IA (ya con las reglas nuevas) la califica otra vez: entra como ejemplo NUEVO, en uso.
  assert.equal(aprenderDeIa(db, { it: IT, texto: `${PRIMERA} ${JUNIOR}`, seguimiento: true, g: { ...g, veredicto: 'bien', falto: '' } }), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_oral_aprendido').get().n, 2);
  assert.deepEqual(ejemplosDe(db, IT).map(e => e.veredicto), ['bien']);
  // Uno por uno (y volver a usar), y lo que ve el administrador.
  const [nuevo, viejo] = ejemplosAdmin(db, PREGUNTA);
  assert.deepEqual([nuevo.retirado, viejo.retirado], [false, true]);
  assert.deepEqual(retirarAprendido(db, PREGUNTA, { id: nuevo.id }), { pregunta: PREGUNTA, activos: 0, retirados: 2 });
  assert.deepEqual(retirarAprendido(db, PREGUNTA, { id: nuevo.id, valor: false }), { pregunta: PREGUNTA, activos: 1, retirados: 1 });
  assert.deepEqual(preguntasAprendidas(db).map(x => [x.pregunta, x.activos, x.retirados]), [[PREGUNTA, 1, 1]]);
  assert.equal(retirarAprendido(db, 'no es una clave'), null);
  assert.equal(retirarAprendido(db, PREGUNTA, { id: 999 }), null);
  assert.ok(JSON.parse(db.prepare("SELECT valor FROM ajustes WHERE clave LIKE 'academia.oral.aprendido.retiro.%'").get().valor).historial.length === 3);
}));

test('el reporte de una calificación: solo dónde (la app), lo de su práctica (el servidor), y la IA recibe la calificación', () => {
  assert.deepEqual(puntoParaMandar(puntoVivo('abcDEF_12', 3, 'Mi nota')), { tipo: 'oral', vivo: { sesion: 'abcDEF_12', i: 3 }, titulo: 'Mi nota' });
  assert.deepEqual(puntoParaMandar({ tipo: 'oral', vivo: { sesion: '<x>', i: -1 } }), { tipo: 'oral' });
  const item = { tipo: 'oral', vista: { pregunta: FRENTES.pregunta_en, respuesta: FRENTES.respuesta_en, respuestaEs: FRENTES.respuesta_es, calificacion: { veredicto: 'casi', primera: { texto: 'Algo, mi correo es ana@x.com', veredicto: 'casi' }, repregunta: REPREGUNTA, seguimiento: { texto: JUNIOR, veredicto: 'casi', falto: 'no sube después' } } }, fuentes: [] };
  const a = armarRevision(item, [{ que: 'respuesta', texto: 'La FAA dice que sube después del paso.' }]);
  assert.match(a.sistema, /CALIFICACIÓN fue injusta/);
  const d = datosDe(a.texto).punto;
  assert.equal(d.calificacion.repregunta, REPREGUNTA);
  assert.equal(d.calificacion.respuesta_a_la_repregunta.lo_que_falto_segun_el_calificador, 'no sube después');
  assert.ok(!a.texto.includes('ana@x.com'), 'sin datos personales');
});

const ORAL = paqueteOralMuestra();
async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(ORAL) });
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
const tareaVivo = c => c.db.prepare(`SELECT id, datos FROM tareas WHERE datos LIKE '%"uso":"instructor_oral_vivo"%' ORDER BY id DESC`).get();
const ia = (veredicto, extra = {}) => ({ tipo: 'ok', json: { veredicto, linea: 'Casi.', bien_dicho: 'Lo principal.', falto: veredicto === 'bien' ? '' : 'Algo de fuera de la repregunta.', repregunta: '', repregunta_puntos: [], ...extra } });

test('por las rutas: la repregunta lleva sus puntos (que nunca viajan a la pantalla), el ⚑ de la calificación, «Sí, es un error» retira lo aprendido y ya no cuenta', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const pVeces = ORAL.materias[0].temas[0].libro_qa[1];
    const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 6 } })).datos;
    const i = s.preguntas.findIndex(q => q.pregunta_en === pVeces.pregunta_en);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i, texto: 'Con un instructor cada tanto' } })).datos.estado, 'pendiente');
    // Antes de calificada, no hay reporte de la calificación.
    const sinNota = await pedir(c.base, 'POST', '/api/soporte/reporte', { galleta: c.z, datos: { que: 'respuesta', porque: 'Me calificaron mal esta respuesta.', contexto: { pantalla: '#oral/vivo' }, item: { tipo: 'oral', vivo: { sesion: s.sesion, i } } } });
    assert.equal(sinNota.codigo, 409, JSON.stringify(sinNota.datos));
    c.falso.siguiente(ia('casi', { repregunta: '¿Cada cuánto tiempo?', repregunta_puntos: ['Cada 24 meses calendario'] }));
    await c.hacer(tareaVivo(c).id);
    const v = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/${i}`, { galleta: c.z })).datos;
    assert.equal(v.repregunta, '¿Cada cuánto tiempo?');
    assert.ok(!JSON.stringify(v).includes('24 meses'), 'los puntos de la repregunta no viajan a la pantalla');
    const r1 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i, texto: 'Cada dos años', seguimiento: true } })).datos;
    assert.ok(!JSON.stringify(r1).includes('24 meses'));
    const t = datosDe(JSON.parse(tareaVivo(c).datos).texto);
    assert.deepEqual([t.repregunta, t.puntos_esperados], ['¿Cada cuánto tiempo?', ['Cada 24 meses calendario']]);
    assert.match(t.alcance, /SOLO lo que pregunta la repregunta/);
    c.falso.siguiente(ia('casi', { falto: 'Lo de fuera: no sube después.' }));
    await c.hacer(tareaVivo(c).id);
    const p = pedidosIa(c).at(-1);
    assert.match(sistemaDe(cuerpoDe(p)), /La respuesta del libro es un RESUMEN corto/);
    assert.match(JSON.stringify(cuerpoDe(p)), /puntos_esperados/);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/${i}`, { galleta: c.z })).datos.veredicto, 'casi');
    const aprendidas = c.db.prepare('SELECT COUNT(*) AS n FROM academia_oral_aprendido').get().n;
    assert.equal(aprendidas, 2, 'la primera y la repregunta');
    // ⚑ Reportar la calificación: el servidor saca de SU práctica qué pregunta es y lo que le dijeron.
    const rep = await pedir(c.base, 'POST', '/api/soporte/reporte', { galleta: c.z, datos: { que: 'respuesta', porque: 'La repregunta no preguntaba eso; me pidieron otra cosa.', contexto: { pantalla: '#oral/vivo' }, item: { tipo: 'oral', vivo: { sesion: s.sesion, i } } } });
    assert.equal(rep.codigo, 201, JSON.stringify(rep.datos));
    assert.equal((await pedir(c.base, 'POST', '/api/soporte/reporte', { galleta: c.q, datos: { que: 'respuesta', porque: 'No es mi práctica, no debería poder.', contexto: {}, item: { tipo: 'oral', vivo: { sesion: s.sesion, i } } } })).codigo, 404, 'otro alumno no');
    const id = rep.datos.ticket.id;
    const vista = (await pedir(c.base, 'GET', `/api/admin/reportes/${id}`, { galleta: c.admin })).datos.reporte;
    const item = vista.reporte.item;
    assert.equal(item.ref.nota, true);
    assert.equal(item.ref.aprendido, `${s.preguntas[i].materia}/${s.preguntas[i].tema}#${huella(pVeces.pregunta_en)}`);
    assert.match(item.clave, /\.nota$/, 'otro punto que el de la respuesta del libro');
    assert.deepEqual([item.vista.calificacion.primera.texto, item.vista.calificacion.repregunta, item.vista.calificacion.seguimiento.texto, item.vista.calificacion.seguimiento.falto],
      ['Con un instructor cada tanto', '¿Cada cuánto tiempo?', 'Cada dos años', 'Lo de fuera: no sube después.']);
    // «Dudoso» no retira nada; «Sí, es un error» retira lo aprendido de esa pregunta (sin borrarlo).
    assert.equal((await pedir(c.base, 'POST', `/api/admin/reportes/${id}/veredicto`, { galleta: c.admin, datos: { valor: 'dudoso' } })).datos.aprendido, undefined);
    const si = (await pedir(c.base, 'POST', `/api/admin/reportes/${id}/veredicto`, { galleta: c.admin, datos: { valor: 'si' } })).datos;
    assert.deepEqual([si.aprendido.activos, si.aprendido.retirados], [0, 2]);
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_oral_aprendido').get().n, 2, 'nada se borra');
    // Otro alumno sin IA, con la misma respuesta: ya no le llega ese veredicto aprendido.
    c.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(clavePausa(c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'quirino'").get().id), JSON.stringify({ pausada: true }), new Date().toISOString());
    const s2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 6 } })).datos;
    const i2 = s2.preguntas.findIndex(q => q.pregunta_en === pVeces.pregunta_en);
    const g2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s2.sesion, i: i2, texto: 'Con un instructor cada tanto' } })).datos;
    assert.equal(g2.sistema, true);
    assert.equal(g2.aprendido, undefined, 'lo retirado no cuenta');
    // El administrador: las preguntas, sus ejemplos, y volver a usar uno.
    const lista = (await pedir(c.base, 'GET', '/api/admin/academia/oral-aprendido', { galleta: c.admin })).datos.preguntas;
    const fila = lista.find(x => x.pregunta === item.ref.aprendido);
    assert.deepEqual([fila.activos, fila.retirados, fila.texto.pregunta_en], [0, 2, pVeces.pregunta_en]);
    const ej = (await pedir(c.base, 'GET', `/api/admin/academia/oral-aprendido?pregunta=${encodeURIComponent(fila.pregunta)}`, { galleta: c.admin })).datos.ejemplos;
    assert.equal(ej.length, 2);
    assert.ok(!JSON.stringify(ej).includes('Con un instructor cada tanto'), 'nunca lo que dijo el alumno tal cual');
    const vuelta = (await pedir(c.base, 'POST', '/api/admin/academia/oral-aprendido/retirar', { galleta: c.admin, datos: { pregunta: fila.pregunta, id: ej[0].id, valor: false } })).datos;
    assert.deepEqual([vuelta.activos, vuelta.retirados], [1, 1]);
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/oral-aprendido', { galleta: c.z })).codigo, 403, 'solo el administrador');
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/oral-aprendido/retirar', { galleta: c.admin, datos: { pregunta: 'x' } })).codigo, 404);
  });
});

test('«Bien / Casi / Mal» se leen bien en claro y en oscuro (tokens con contraste AA, «Casi» ≥ 7:1, y el icono)', () => {
  const css = readFileSync(new URL('../public/academia.css', import.meta.url), 'utf8');
  const bloque = re => { const m = re.exec(css); assert.ok(m, String(re)); return m[1]; };
  const claro = bloque(/^:root \{([\s\S]*?)^\}/m);
  const oscuro = bloque(/^:root\[data-tema="oscuro"\] \{([\s\S]*?)^\}/m);
  const auto = bloque(/@media \(prefers-color-scheme: dark\) \{\n  :root\[data-tema="auto"\] \{([\s\S]*?)\n  \}/);
  const token = (b, k) => { const m = new RegExp(`--${k}: (#[0-9a-f]{6});`).exec(b); assert.ok(m, k); return m[1]; };
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [modo, b] of [['claro', claro], ['oscuro', oscuro], ['auto de noche', auto]]) {
    for (const v of ['verde', 'casi', 'rojo']) {
      const k = contraste(token(b, `${v}-texto`), token(b, `${v}-suave`));
      assert.ok(k >= (v === 'casi' ? 7 : 4.5), `${modo}: ${v} ${k.toFixed(2)}:1`);
    }
  }
  assert.match(css, /\.vivo-veredicto\.tono-casi \{ background: var\(--casi-suave\); color: var\(--casi-texto\); border: 1\.5px solid var\(--casi-borde\); \}/);
  assert.doesNotMatch(css, /\.vivo-veredicto\.tono-casi \{[^}]*--mc-suave/, 'nunca un token que fuera de una materia no existe');
  assert.match(css, /\.insignia\.tono-casi \{ --tono: var\(--casi-texto\); \}/);
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.match(vista, /icono\(v === 'bien' \? 'bien' : v === 'casi' \? 'atencion' : 'mal', 'icono'\)/, 'el icono además del color');
  assert.match(vista, /enlaceReportar\(puntoVivo\(s\.sesion, i, t\('reportar\.vivo\.titulo'\)\)/, '⚑ en el «¿Por qué?» de la práctica');
  assert.match(vista, /enlaceReportar\(puntoVivo\(sesion, q\.i, t\('reportar\.vivo\.titulo'\)\)/, '⚑ en el repaso del final');
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  for (const k of ['reportar.sobre.oral_nota', 'reportar.vivo.titulo', 'reportar.admin.nota.retirados', 'ia3.aprendido.revisar', 'ia3.aprendido.retirar']) assert.ok(es[k] && en[k], k);
  assert.ok(normalizar('nubes').length === 1);
});
