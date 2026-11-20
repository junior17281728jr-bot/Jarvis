// Academia 0.14.59: «Dónde más cuesta» (por tema y por tarjeta), el orden de la mejora de la IA y la «Otra forma de
// verlo» que pasa a la clase. Todo con alumnos y datos INVENTADOS aquí (el paquete de muestra de las pruebas), fechas
// fijas y sin la IA: el proveedor falso no recibe ni un pedido.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir } from './instructor-ia-base.js';
import { encolar } from '../src/tareas/cola.js';
import { conFabrica } from './fabrica-base.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { paqueteActivo, guardarAjuste, leerAjuste } from '../src/academia/paquetes.js';
import { analisisTema } from '../src/academia/tutor.js';
import { guardarConfigFabrica } from '../src/academia/fabrica.js';
import { anotarEvidenciaTarjeta, SEMANA_MS } from '../src/academia/fabrica-mejora.js';
import {
  MUESTRA, PROMOVER, puntaje, ordenarPorCuesta, prioridades, criterioPromover, calcularCuesta, decidirPromociones, calcularTodo, guardarTodo,
  anotarUsoTarjeta, otraFormaDe, idTarjeta, huellaTarjeta, listaAdmin, CLAVE_FOTO,
} from '../src/academia/donde-cuesta.js';

const MATERIA = 'factores_humanos';
const TEMA = 'muestra-hipoxia';
const CLAVE_IA = `academia.ia.tarjeta.${'a'.repeat(32)}`;
const T = n => new Date(Date.parse('2026-11-01T10:00:00Z') + n * 60_000).toISOString();

function alumnos(db, n, prefijo = 'al') {
  const admin = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get()?.id ?? null;
  return Array.from({ length: n }, (_, i) => crearUsuario(db, { nombre: `${prefijo}${i}`, claveHash: 'x', creadoPor: admin }));
}
function responder(db, u, pregunta, correcta, en) {
  const it = db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, empezado_en) VALUES (?, 'practica', ?)").run(u, en).lastInsertRowid;
  db.prepare('INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(it, u, pregunta, MATERIA, TEMA, correcta ? 'B' : 'A', correcta ? 1 : 0, en.slice(0, 10), en);
}
// La primera tarjeta del tema que explica preguntas del Test Guide, con sus preguntas.
function tarjetaConPreguntas(p) {
  const a = analisisTema(p, MATERIA, TEMA);
  const [indice, ids] = [...a.porTarjeta.entries()].sort((x, y) => x[0] - y[0])[0];
  const s = p.materias.find(m => m.id === MATERIA).temas.find(t => t.id === TEMA).secciones[indice];
  return { indice, ids, s };
}
const guardarExplicacion = (db, clave = CLAVE_IA, extra = {}) => guardarAjuste(db, clave, JSON.stringify({ tipo: 'mejor', explicacion: 'Arriba el aire empuja menos: cada respiración trae menos oxígeno.', ejemplo: 'Subiendo sin oxígeno.', recuerda: 'Más alto, menos oxígeno.', terminos: [], en: '2026-11-01T09:00:00.000Z', ...extra }));

test('el puntaje pide una muestra mínima: con 1, 2… 9 respuestas o 2 alumnos no dice nada', () => {
  for (let n = 1; n < MUESTRA.respuestas; n++) assert.equal(puntaje({ fallo: { n, mal: n, alumnos: 5 } }).puntaje, null, `${n} respuestas`);
  assert.equal(puntaje({ fallo: { n: 40, mal: 40, alumnos: MUESTRA.alumnos - 1 } }).puntaje, null, 'de muy pocos alumnos');
  assert.equal(puntaje({ fallo: { n: 10, mal: 6, alumnos: 3 } }).puntaje, 60);
  assert.equal(puntaje({ pide: { pidieron: 2, alumnos: MUESTRA.pide - 1 } }).puntaje, null, 'pedir ayuda: con menos de 5 alumnos no cuenta');
  assert.equal(puntaje({ despues: { n: MUESTRA.despues - 1, bien: 0 } }).puntaje, null);
  // Junta solo lo que tiene datos, con sus pesos: fallo 60 (0,5) + pide 20 (0,3) + después 100 (0,2) = 56.
  const r = puntaje({ fallo: { n: 10, mal: 6, alumnos: 3 }, pide: { pidieron: 2, alumnos: 10 }, despues: { n: 5, bien: 0 } });
  assert.equal(r.puntaje, 56);
  assert.deepEqual([r.partes.fallo.ok, r.partes.pide.ok, r.partes.despues.ok], [true, true, true]);
  // Una parte sin datos suficientes no baja ni sube el resto.
  assert.equal(puntaje({ fallo: { n: 10, mal: 6, alumnos: 3 }, despues: { n: 2, bien: 0 } }).puntaje, 60);
});

test('el orden de la mejora: primero lo que más cuesta; empates y lo que no tiene puntaje, como antes', () => {
  const items = [
    { tipo: 'pregunta', materia: 'm', tema: 'a', pregunta: 'tg-1', peso: 500 },
    { tipo: 'tarjeta', materia: 'm', tema: 'b', titulo: 'Fácil', peso: 9 },
    { tipo: 'tarjeta', materia: 'm', tema: 'b', titulo: 'Difícil', peso: 3 },
    { tipo: 'opinion', materia: 'm', tema: 'c', titulo: null, peso: 4 },
    { tipo: 'pregunta', materia: 'z', tema: 'x', pregunta: 'tg-9', peso: 1 },
  ];
  const foto = { tarjetas: [{ materia: 'm', tema: 'b', titulo: 'Difícil', puntaje: 80 }, { materia: 'm', tema: 'b', titulo: 'Fácil', puntaje: 20 }], temas: [{ materia: 'm', tema: 'c', puntaje: 50 }, { materia: 'm', tema: 'a', puntaje: 20 }] };
  const orden = ordenarPorCuesta(items, prioridades(foto));
  assert.deepEqual(orden.map(x => x.titulo ?? x.pregunta ?? x.tema), ['Difícil', 'c', 'tg-1', 'Fácil', 'tg-9'], 'empate a 20: el orden de antes (la pregunta pesaba más)');
  assert.equal(orden.length, items.length, 'no agrega ni quita nada');
  assert.equal(orden[0].cuesta, 80);
  assert.equal(orden.at(-1).cuesta, undefined, 'sin puntaje queda al final, sin marca');
  assert.deepEqual(ordenarPorCuesta(items, prioridades(null)), items, 'sin la cuenta: el orden de siempre');
});

test('pasar a la clase: solo con muestra en los dos grupos y una ventaja clara', () => {
  const de = (n, bien) => ({ n, bien });
  assert.equal(criterioPromover([de(2, 2), de(2, 2)], [de(5, 0), de(5, 0), de(5, 0)]).sirve, false, '2 alumnos que la vieron: muy pocos');
  assert.equal(criterioPromover(Array(PROMOVER.vieron).fill(de(2, 2)), [de(5, 0), de(5, 0)]).sirve, false, '2 que no la vieron: muy pocos');
  assert.equal(criterioPromover(Array(PROMOVER.vieron).fill(de(1, 1)), Array(3).fill(de(5, 0))).sirve, false, '5 respuestas después: muy pocas');
  const si = criterioPromover(Array(5).fill(de(2, 2)), Array(3).fill(de(4, 2)));
  assert.equal(si.sirve, true);
  assert.deepEqual([si.vieron.pct, si.sin.pct], [100, 50]);
  assert.equal(criterioPromover(Array(5).fill(de(2, 1)), Array(3).fill(de(4, 2))).sirve, false, 'igual que los demás: no ayuda');
});

test('la cuenta por tema y por tarjeta (SQL), la «Otra forma de verlo» en la clase, ocultar y la huella del texto — sin IA', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { indice, ids, s } = tarjetaConPreguntas(p);
    // Con 2 respuestas: nada (ni tema ni tarjeta).
    const pocos = alumnos(db, 2, 'poco');
    for (const u of pocos) responder(db, u, ids[0], false, T(1));
    assert.deepEqual(calcularCuesta(db, p).tarjetas, []);
    assert.deepEqual(calcularCuesta(db, p).temas, []);
    // 5 vieron la explicación guardada y después aciertan; 4 nunca la vieron y fallan.
    guardarExplicacion(db);
    const vieron = alumnos(db, 5, 'vio');
    const sinVer = alumnos(db, 4, 'sin');
    for (const u of vieron) {
      responder(db, u, ids[0], false, T(2));
      anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: u, tipo: 'mejor', clave: CLAVE_IA, ahora: Date.parse(T(3)) });
      for (const q of ids) responder(db, u, q, true, T(4));
      responder(db, u, ids[0], true, T(5));
    }
    for (const u of sinVer) for (const q of ids) { responder(db, u, q, false, T(4)); responder(db, u, q, false, T(6)); }
    const cuenta = calcularCuesta(db, p);
    const tarjeta = cuenta.tarjetas.find(x => x.indice === indice);
    assert.ok(tarjeta && tarjeta.puntaje > 0, JSON.stringify(cuenta.tarjetas));
    assert.equal(tarjeta.partes.pide.pidieron, 5);
    assert.equal(tarjeta.partes.despues.pct, 0, 'después de la ayuda acertaron todos');
    assert.ok(cuenta.temas.some(x => x.tema === TEMA));
    // Pasa a la clase y la ve cualquier alumno (gratis).
    const todo = calcularTodo(db, p, Date.parse(T(10)));
    assert.equal(todo.promociones.length, 1);
    guardarTodo(db, todo, Date.parse(T(10)));
    const promo = JSON.parse(leerAjuste(db, `academia.clase.otra.${idTarjeta(MATERIA, TEMA, s.titulo)}`));
    assert.equal(promo.clave, CLAVE_IA);
    assert.equal(promo.h, huellaTarjeta(s));
    const l = await pedir(c.base, 'GET', `/api/academia/temas/${MATERIA}/${TEMA}`, { galleta: c.z });
    assert.equal(l.codigo, 200);
    assert.deepEqual(l.datos.secciones[indice].otraForma, { explicacion: 'Arriba el aire empuja menos: cada respiración trae menos oxígeno.', ejemplo: 'Subiendo sin oxígeno.', recuerda: 'Más alto, menos oxígeno.' });
    assert.equal(l.datos.secciones.filter(x => x.otraForma).length, 1, 'solo en esa tarjeta');
    // El administrador la ve en «Dónde más les cuesta» y la puede ocultar (el «ocultar» de siempre).
    const a = await pedir(c.base, 'GET', '/api/admin/academia/cuesta', { galleta: c.admin });
    assert.equal(a.codigo, 200);
    const fila = a.datos.lista.find(x => x.tipo === 'tarjeta' && x.indice === indice);
    assert.ok(fila?.promovida, JSON.stringify(a.datos));
    assert.ok(a.datos.lista.length <= 10);
    const o = await pedir(c.base, 'POST', '/api/admin/academia/ia-biblioteca/ocultar', { galleta: c.admin, datos: { clave: CLAVE_IA, oculto: true } });
    assert.equal(o.codigo, 200, JSON.stringify(o.datos));
    assert.equal((await pedir(c.base, 'GET', `/api/academia/temas/${MATERIA}/${TEMA}`, { galleta: c.z })).datos.secciones[indice].otraForma, undefined, 'oculta: ya no sale');
    assert.equal(listaAdmin(db, p, todo.foto).find(x => x.indice === indice).promovida.oculta, true);
    await pedir(c.base, 'POST', '/api/admin/academia/ia-biblioteca/ocultar', { galleta: c.admin, datos: { clave: CLAVE_IA, oculto: false } });
    assert.ok(otraFormaDe(db, s, { materia: MATERIA, tema: TEMA }));
    // Si el texto de la tarjeta cambia, ya no vale (y no se borra nada).
    assert.equal(otraFormaDe(db, { ...s, texto: `${s.texto ?? ''} Otra frase.` }, { materia: MATERIA, tema: TEMA }), null);
    assert.ok(leerAjuste(db, `academia.clase.otra.${idTarjeta(MATERIA, TEMA, s.titulo)}`), 'el registro sigue guardado');
    // Una en inglés: nunca a quien estudia en español.
    const claveP = `academia.clase.otra.${idTarjeta(MATERIA, TEMA, s.titulo)}`;
    guardarAjuste(db, claveP, JSON.stringify({ ...promo, idioma: 'en' }));
    assert.equal(otraFormaDe(db, s, { materia: MATERIA, tema: TEMA, idioma: 'es' }), null);
    assert.ok(otraFormaDe(db, s, { materia: MATERIA, tema: TEMA, idioma: 'en' }));
    assert.equal(c.falso.peticiones.length, 0, 'ni un pedido a la IA');
  }, { encender: false });
});

test('con muestra chica no pasa nada a la clase; nunca algo de un alumno ni su nombre', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { ids, s } = tarjetaConPreguntas(p);
    guardarExplicacion(db);
    // 4 la vieron (hace falta 5): no pasa, aunque acierten todo.
    for (const u of alumnos(db, 4, 'vio')) {
      anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: u, tipo: 'mejor', clave: CLAVE_IA, ahora: Date.parse(T(1)) });
      for (const q of ids) { responder(db, u, q, true, T(2)); responder(db, u, q, true, T(3)); responder(db, u, q, true, T(4)); }
    }
    for (const u of alumnos(db, 4, 'sin')) for (const q of ids) { responder(db, u, q, false, T(2)); responder(db, u, q, false, T(3)); }
    assert.deepEqual(decidirPromociones(db, p), []);
    // Algo de UN alumno (una duda, un chat) nunca entra como explicación para todos.
    const quien = alumnos(db, 1, 'otro')[0];
    const v = anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: quien, tipo: 'mejor', clave: `academia.ia.duda.${quien}.123`, ahora: Date.parse(T(5)) });
    assert.ok(!v.claves.some(x => x.clave.includes('duda')));
    assert.equal(v.u[String(quien)].v, undefined, 'no cuenta como vista');
    // Lo que se guarda para la clase y lo que ve el administrador: sin ids de alumnos ni nombres.
    for (const u of alumnos(db, 2, 'mas')) {
      anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: u, tipo: 'mejor', clave: CLAVE_IA, ahora: Date.parse(T(1)) });
      for (const q of ids) { responder(db, u, q, true, T(2)); responder(db, u, q, true, T(3)); }
    }
    const todo = calcularTodo(db, p, Date.parse(T(10)));
    assert.equal(todo.promociones.length, 1, 'con 6 que la vieron, sí');
    guardarTodo(db, todo, Date.parse(T(10)));
    const nombres = db.prepare("SELECT id, nombre FROM usuarios WHERE rol <> 'admin'").all();
    const guardado = leerAjuste(db, `academia.clase.otra.${idTarjeta(MATERIA, TEMA, s.titulo)}`) + leerAjuste(db, CLAVE_FOTO) + JSON.stringify(listaAdmin(db, p, todo.foto));
    for (const u of nombres) assert.ok(!guardado.includes(u.nombre), `aparece ${u.nombre}`);
    const promo = JSON.parse(leerAjuste(db, `academia.clase.otra.${idTarjeta(MATERIA, TEMA, s.titulo)}`));
    assert.deepEqual(Object.keys(promo).sort(), ['clave', 'en', 'h', 'idioma', 'materia', 'medida', 'tema', 'titulo']);
    assert.deepEqual(Object.keys(otraFormaDe(db, s, { materia: MATERIA, tema: TEMA })).sort(), ['ejemplo', 'explicacion', 'recuerda']);
    assert.equal(c.falso.peticiones.length, 0);
  }, { encender: false });
});

test('pedir ayuda en una tarjeta (la ruta de siempre) queda contado para esa tarjeta, sin IA', async () => {
  await conInstructor(async c => {
    const p = paqueteActivo(c.db, c.config);
    const { indice, s } = tarjetaConPreguntas(p);
    for (const tipo of ['mejor', 'profundizar']) {
      const r = await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.z, datos: { materia: MATERIA, tema: TEMA, tarjeta: indice + 1, tipo, ia: false } });
      assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    }
    const v = JSON.parse(leerAjuste(c.db, `academia.cuesta.t.${idTarjeta(MATERIA, TEMA, s.titulo)}`));
    const z = c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'zoelia'").get().id;
    assert.equal(v.u[String(z)].m, 1);
    assert.equal(v.u[String(z)].f, 1);
    assert.equal(v.h, huellaTarjeta(s));
    assert.equal(c.falso.peticiones.length, 0);
  }, { encender: false });
});

test('la mejora semanal con la cuenta de «Dónde más cuesta»: respeta su tope y su interruptor (cero llamadas)', async () => {
  await conFabrica(async ({ db, correr, llamadas, admin, avanzar, reloj }) => {
    await correr();
    const n = llamadas().length;
    const ids = Array.from({ length: 3 }, (_, i) => crearUsuario(db, { nombre: `a${i}`, claveHash: 'x', creadoPor: admin }));
    for (const u of ids) anotarEvidenciaTarjeta(db, { materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', usuarioId: u });
    avanzar(SEMANA_MS + 1000);
    // Una cuenta reciente que pone esa tarjeta arriba de todo.
    guardarAjuste(db, CLAVE_FOTO, JSON.stringify({ en: new Date(reloj()).toISOString(), temas: [{ materia: 'sistemas', tema: 't01-motor', puntaje: 90, partes: {} }], tarjetas: [{ materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', indice: 0, puntaje: 95, partes: {} }] }));
    guardarConfigFabrica(db, { mejora: { activa: false } });
    assert.equal((await correr()).at(-1).resultado.mejora, 'apagada');
    guardarConfigFabrica(db, { mejora: { activa: true, topeMesMicro: 1_000 } });
    guardarAjuste(db, 'fabrica.mejora.ultima', 'null');
    const r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'tope_fabrica');
    assert.equal(llamadas().length, n, 'el tope manda: ni una llamada');
    // El trabajo quedó con la tarjeta que más cuesta primero (y nada más que la evidencia de siempre).
    const trabajo = JSON.parse(leerAjuste(db, 'fabrica.mejora.trabajo'));
    assert.equal(trabajo.items[0].titulo, 'La hélice');
    assert.equal(trabajo.items[0].cuesta, 95);
  });
});

test('cada explicación guardada se mide sola: 3 + 3 alumnos repartidos entre dos no alcanzan; 5 en una, sí (esa)', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { ids, s } = tarjetaConPreguntas(p);
    const OTRA = `academia.ia.tarjeta.${'c'.repeat(32)}`;
    guardarExplicacion(db);
    guardarExplicacion(db, OTRA, { explicacion: 'Otra explicación guardada (otro estilo).' });
    const ver = (u, clave, n) => {
      anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: u, tipo: 'mejor', clave, ahora: Date.parse(T(n)) });
      for (const q of ids) { responder(db, u, q, true, T(n + 1)); responder(db, u, q, true, T(n + 2)); }
    };
    for (const u of alumnos(db, 3, 'a')) ver(u, CLAVE_IA, 1);
    for (const u of alumnos(db, 3, 'b')) ver(u, OTRA, 1);
    for (const u of alumnos(db, 4, 'sin')) for (const q of ids) { responder(db, u, q, false, T(2)); responder(db, u, q, false, T(3)); }
    assert.deepEqual(decidirPromociones(db, p), [], '6 la vieron, pero 3 y 3: ninguna tiene su muestra');
    for (const u of alumnos(db, 2, 'b2')) ver(u, OTRA, 5);
    const r = decidirPromociones(db, p);
    assert.equal(r.length, 1);
    assert.equal(r[0].valor.clave, OTRA, 'la que tiene 5 alumnos');
    assert.equal(r[0].valor.medida.vieron.alumnos, 5);
  }, { encender: false });
});

test('la cuenta de la hora la hace el trabajador (sistema.vigilar), aunque la IA esté apagada, sin pedirle nada a la IA', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { ids } = tarjetaConPreguntas(p);
    for (const u of alumnos(db, 4, 'v')) for (const q of ids) { responder(db, u, q, false, T(1)); responder(db, u, q, false, T(2)); }
    assert.equal(leerAjuste(db, CLAVE_FOTO), null);
    const id = encolar(db, { tipo: 'sistema.vigilar' }).id;
    const t = await c.hacer(id);
    assert.equal(t.estado, 'hecha', JSON.stringify(t.resultado));
    const foto = JSON.parse(leerAjuste(db, CLAVE_FOTO));
    assert.ok(foto.temas.some(x => x.tema === TEMA), JSON.stringify(foto));
    assert.equal(c.falso.peticiones.length, 0);
  }, { encender: false });
});
