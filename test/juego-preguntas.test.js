// 0.14.99: el Juego de vuelo con preguntas: de dónde salen (la Práctica del instructor y la ronda del oral, sin la
// respuesta), su tema y la falla que trae fallarlas, los eventos del vuelo, el puntaje, el vuelo guiado (vidas, fin,
// maniobras y el piloto automático que aterriza) y que cada respuesta se guarda como práctica de siempre.
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import {
  JUEGO, categoriaDe, poolDePreguntas, elegirPregunta, pedidoRespuesta, adaptarRespuesta, lineaPorque, consecuenciaDe, rafagaTurbulencia,
  azarSembrado, crearAgenda, siguienteEvento, vientoNuevo, vientoCruzado, puntuar, puntajeInicial,
} from '../public/clase/juego-eventos.js';
import { GUIADO, RUTA_GUIADA, INICIO_GUIADO, crearGuiado, responderGuiado, maniobraDe, llego, piloto, pilotoFinal, enFinal, rumboHacia } from '../public/clase/juego-guiado.js';
import { crearAvion, pasoVuelo, juzgarAterrizaje } from '../public/clase/vuelo-modelo.js';

test('el tema de cada pregunta y lo que pasa si se falla: motor → aceite, meteorología → turbulencia, espacio y radio → el control', () => {
  assert.equal(categoriaDe({ materia: 'sistemas', enunciado: 'x' }), 'motor');
  assert.equal(categoriaDe({ materia: 'oral_meteorologia', enunciado: 'x' }), 'meteo');
  assert.equal(categoriaDe({ materia: 'comunicacion', enunciado: 'x' }), 'espacio');
  assert.equal(categoriaDe({ materia: 'factores_humanos', enunciado: 'What should you do if the oil pressure drops?' }), 'motor');
  assert.equal(categoriaDe({ materia: 'factores_humanos', enunciado: '¿A qué distancia de una tormenta severa?' }), 'meteo');
  assert.equal(categoriaDe({ materia: 'factores_humanos', enunciado: 'Before entering Class C airspace you must…' }), 'espacio');
  assert.equal(categoriaDe({ materia: 'factores_humanos', enunciado: '¿Qué es la hipoxia?' }), 'otra');
  assert.equal(consecuenciaDe('motor', false), 'aceite');
  assert.equal(consecuenciaDe('meteo', false), 'turbulencia');
  assert.equal(consecuenciaDe('espacio', false), 'atc');
  assert.equal(consecuenciaDe('otra', false), 'turbulencia');
  for (const c of ['motor', 'meteo', 'espacio', 'otra']) assert.equal(consecuenciaDe(c, true), 'bien');
  // La turbulencia depende solo del tiempo (siempre igual) y empuja de verdad.
  const r = rafagaTurbulencia(1, 2);
  assert.deepEqual(r(3.3), rafagaTurbulencia(1, 2)(3.3));
  assert.ok(Math.abs(r(1).alabeo) + Math.abs(r(2).alabeo) > 1);
});

test('las preguntas del vuelo: el Test Guide en su orden (lo fallado y lo nuevo primero) con una del oral cada 3; sin figura ni ya respondidas', () => {
  const q = (id, extra = {}) => ({ id, materia: 'sistemas', enunciado: `¿${id}?`, opciones: [{ letra: 'A', texto: 'a' }, { letra: 'B', texto: 'b' }], ...extra });
  const tg = { id: 7, preguntas: [q('t1'), q('t2', { figura: { numero: 3 } }), q('t3'), q('t4', { respuesta: { acierto: true } }), q('t5'), q('t6', { materia: 'meteorologia' })] };
  const oral = { preguntas: [q('o1', { materia: 'oral_meteorologia' }), q('o2')] };
  const pool = poolDePreguntas(tg, oral);
  assert.deepEqual(pool.map(p => p.q.id), ['t1', 't3', 'o1', 't5', 't6', 'o2']);
  assert.equal(pool[0].fuente, 'tg'); assert.equal(pool[0].intento, 7); assert.equal(pool[2].fuente, 'oral');
  // Elegir: la primera que no salió; con un tema pedido (la tormenta pide meteorología), una de ese tema.
  assert.equal(elegirPregunta(pool, new Set()).q.id, 't1');
  assert.equal(elegirPregunta(pool, new Set(['t1'])).q.id, 't3');
  assert.equal(elegirPregunta(pool, new Set(), 'meteo').q.id, 'o1');
  assert.equal(elegirPregunta(pool, new Set(pool.map(p => p.q.id))), null);
  // Lo que se manda: solo la pregunta y la letra, a la práctica de siempre.
  assert.deepEqual(pedidoRespuesta(pool[0], 'B'), { ruta: '/api/academia/intentos/7/responder', datos: { pregunta: 't1', elegida: 'B' } });
  assert.deepEqual(pedidoRespuesta(pool[2], 'A'), { ruta: '/api/academia/oral/responder', datos: { pregunta: 'o1', elegida: 'A' } });
  // La respuesta del servidor, igual para las dos.
  assert.deepEqual(adaptarRespuesta('tg', { respuesta: { acierto: false, correcta: 'A', elegida: 'B', sencilla: 's', explicacion: 'e' } }), { acierto: false, correcta: 'A', elegida: 'B', sencilla: 's', explicacion: 'e' });
  assert.deepEqual(adaptarRespuesta('oral', { acierto: true, correcta: 'C', elegida: 'C', sencilla: null }), { acierto: true, correcta: 'C', elegida: 'C', sencilla: null, explicacion: null });
  assert.equal(adaptarRespuesta('tg', { error: 'x' }), null);
  // Una línea del porqué, de la explicación sencilla guardada.
  assert.equal(lineaPorque('✔ La correcta es B.\nPor qué: el aceite lubrica y enfría el motor.'), 'el aceite lubrica y enfría el motor.');
  assert.equal(lineaPorque('Solo un texto.'), 'Solo un texto.');
  assert.equal(lineaPorque(null), '');
  assert.ok(lineaPorque('x'.repeat(400)).length <= 220);
});

test('los eventos del vuelo: nada en tierra ni antes de tiempo; preguntas, tormenta y viento en orden; el cruzado una vez en final', () => {
  let ag = crearAgenda(azarSembrado(5));
  assert.equal(siguienteEvento(ag, 5, { ft: 2000, enSuelo: false }).evento, null, 'antes del primer evento');
  assert.equal(siguienteEvento(ag, 100, { ft: 0, enSuelo: true }).evento, null, 'en tierra');
  assert.equal(siguienteEvento(ag, 100, { ft: 300, enSuelo: false }).evento, null, 'muy bajo');
  assert.equal(siguienteEvento(ag, 100, { ft: 2000, enSuelo: false, ocupado: true }).evento, null, 'con otra cosa abierta');
  const tipos = [];
  let t = JUEGO.primerEventoS;
  for (let k = 0; k < 6; k++) { const r = siguienteEvento(ag, t, { ft: 2500, enSuelo: false }); ag = r.agenda; tipos.push(r.evento.tipo); t = ag.proximo; }
  assert.deepEqual(tipos, ['pregunta', 'pregunta', 'tormenta', 'pregunta', 'viento', 'pregunta']);
  // Siempre igual con la misma semilla.
  const otra = (() => { let a = crearAgenda(azarSembrado(5)); const p = []; let tt = JUEGO.primerEventoS; for (let k = 0; k < 6; k++) { const r = siguienteEvento(a, tt, { ft: 2500, enSuelo: false }); a = r.agenda; p.push(a.proximo); tt = a.proximo; } return p; })();
  assert.equal(otra.length, 6);
  const c1 = siguienteEvento(crearAgenda(azarSembrado(1)), 1, { ft: 500, enSuelo: false, enFinal: true });
  assert.equal(c1.evento.tipo, 'cruzado');
  assert.equal(siguienteEvento(c1.agenda, 2, { ft: 400, enSuelo: false, enFinal: true }).evento, null, 'el cruzado, una sola vez');
  const v = vientoNuevo(azarSembrado(3), { desde: 360, kt: 0 });
  assert.ok(v.desde > 0 && v.desde <= 360 && v.kt >= 12 && v.kt <= 20);
  assert.ok([90, 270].includes(vientoCruzado(azarSembrado(2)).desde));
});

test('el puntaje: bien suma (más con racha), mal no resta; «Ahora no» no cambia nada', () => {
  let p = puntajeInicial();
  const antes = { ...p };
  p = puntuar(p, true); p = puntuar(p, true); p = puntuar(p, false); p = puntuar(p, true);
  assert.equal(p.aceptadas, 4); assert.equal(p.bien, 3); assert.equal(p.mejor, 2); assert.equal(p.racha, 1);
  assert.equal(p.puntos, JUEGO.puntosBien * 3 + JUEGO.puntosRacha);
  assert.deepEqual(puntajeInicial(), antes, 'rechazar una oferta no llama a puntuar: el puntaje queda igual');
});

test('vuelo con preguntas: bien avanza con la maniobra del tramo; mal = una falla (nube, turbulencia, desvío) y una vida; fin en destino o sin vidas', () => {
  let g = crearGuiado();
  assert.equal(g.total, RUTA_GUIADA.length); assert.equal(g.vidas, GUIADO.vidas);
  g = responderGuiado(g, true);
  assert.equal(g.i, 1); assert.equal(g.vidas, 3); assert.equal(g.falla, null);
  g = responderGuiado(g, false); assert.equal(g.falla, 'nube'); assert.equal(g.vidas, 2);
  g = responderGuiado(g, false); assert.equal(g.falla, 'turbulencia'); assert.equal(g.vidas, 1);
  g = responderGuiado(g, true); g = responderGuiado(g, true); g = responderGuiado(g, true);
  assert.equal(g.mejor, 3); assert.equal(g.fin, null);
  const sinVidas = responderGuiado(g, false);
  assert.equal(sinVidas.fin, 'sin_vidas'); assert.equal(sinVidas.vidas, 0); assert.equal(sinVidas.falla, 'desvio');
  assert.equal(responderGuiado(sinVidas, true), sinVidas, 'terminado, no cambia');
  let todo = crearGuiado();
  for (let k = 0; k < RUTA_GUIADA.length; k++) todo = responderGuiado(todo, true);
  assert.equal(todo.fin, 'destino'); assert.equal(todo.bien, RUTA_GUIADA.length);
  // La maniobra que pide cada tramo: a lo largo de la ruta hay virajes a los dos lados, subidas y bajadas.
  const vistas = new Set();
  let a = { ...INICIO_GUIADO };
  for (const wp of RUTA_GUIADA) { for (const x of maniobraDe(a, wp).tipos) vistas.add(x); a = { x: wp.x, z: wp.z, ft: wp.ft, rumbo: rumboHacia(a.x, a.z, wp) }; }
  for (const x of ['derecha', 'izquierda', 'subir', 'bajar']) assert.ok(vistas.has(x), `la ruta pide ${x}`);
  assert.deepEqual(maniobraDe({ x: 0, z: 0, ft: 2000, rumbo: 0 }, { x: 0, z: 10, ft: 2000 }).tipos, ['seguir']);
  assert.deepEqual(maniobraDe({ x: 0, z: 0, ft: 2000, rumbo: 0 }, { x: 10, z: 0, ft: 2800 }).tipos, ['derecha', 'subir']);
  assert.deepEqual(maniobraDe({ x: 0, z: 0, ft: 2000, rumbo: 0 }, { x: -10, z: 1, ft: 1500 }).tipos, ['izquierda', 'bajar']);
});

test('el piloto automático vuela toda la ruta (con un desvío en el medio) y aterriza en la 36', () => {
  let a = crearAvion({ ...INICIO_GUIADO, enSuelo: false, potencia: 0.65 });
  let i = 0, final = false, toque = null;
  for (let k = 0; k < 60 * 1200 && !toque; k++) {
    const t = k / 60;
    let m;
    if (final || (i === RUTA_GUIADA.length - 1 && enFinal(a))) { final = true; m = pilotoFinal(a); }
    else {
      const wp = RUTA_GUIADA[i];
      m = piloto(a, { rumbo: rumboHacia(a.x, a.z, wp), ft: wp.ft }, { desvio: i === 3 && t % 200 < 9 ? 45 : 0 });
      if (llego(a, wp) && i < RUTA_GUIADA.length - 1) i++;
    }
    a = pasoVuelo(a, m, 1 / 60, { asistente: true });
    assert.ok(!a.choque, 'no choca');
    if (a.toque) toque = a.toque;
  }
  assert.equal(i, RUTA_GUIADA.length - 1, 'pasó por todos los puntos');
  assert.ok(toque && toque.dentro, 'aterriza en la pista');
  assert.ok(['bueno', 'firme'].includes(juzgarAterrizaje(toque).nivel), `aterrizaje ${juzgarAterrizaje(toque).nivel}`);
});

// ---------- con el servidor de verdad ----------
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const CLAVE = 'una clave bien larga';
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}

test('con el servidor: las preguntas llegan sin la respuesta, primero las que falló, y cada respuesta queda guardada como práctica', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { azar: () => 0.42, reloj: () => Date.parse('2026-11-21T15:00:00Z') } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    for (const archivo of s.datos.faltan) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} });
    const idAna = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    // Ana practica un tema y falla 2.
    const tema = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
    const falladas = tema.preguntas.slice(0, 2).map(q => q.id);
    for (const q of tema.preguntas) {
      const elegida = falladas.includes(q.id) ? ['A', 'B', 'C'].find(l => l !== DE(q.id).original.correcta) : DE(q.id).original.correcta;
      await pedir(base, 'POST', `/api/academia/intentos/${tema.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida } });
    }
    // El juego pide sus preguntas como la Práctica del instructor.
    const tg = await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'instructor', cuantas: 10 } });
    assert.equal(tg.codigo, 201);
    const pool = poolDePreguntas(tg.datos, null);
    assert.ok(pool.length >= 2);
    // Nada de la respuesta antes de responder.
    const texto = JSON.stringify(pool);
    for (const prohibido of ['"correcta"', '"explicacion"', '"sencilla"', '"errores"', '"acierto"']) assert.ok(!texto.includes(prohibido), `sin ${prohibido} antes de responder`);
    // Las que falló, primero.
    assert.ok(falladas.includes(pool[0].q.id), `la primera es una que falló (${pool[0].q.id})`);
    // Responder mal desde el juego: se guarda como práctica (la misma tabla que Mi repaso y «Dónde más cuesta»).
    const item = pool[0];
    const mal = ['A', 'B', 'C'].find(l => l !== DE(item.q.id).original.correcta);
    const { ruta, datos } = pedidoRespuesta(item, mal);
    const r = await pedir(base, 'POST', ruta, { galleta: ana, datos });
    const res = adaptarRespuesta(item.fuente, r.datos);
    assert.equal(res.acierto, false); assert.equal(res.correcta, DE(item.q.id).original.correcta);
    const filas = db.prepare('SELECT r.correcta, i.tipo FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id WHERE r.usuario_id = ? AND r.pregunta = ? ORDER BY r.id').all(idAna, item.q.id);
    assert.deepEqual({ ...filas.at(-1) }, { correcta: 0, tipo: 'instructor' });
    // Y Mi repaso la tiene.
    const repaso = await pedir(base, 'GET', '/api/academia/mi-repaso', { galleta: ana });
    assert.ok(JSON.stringify(repaso.datos).includes(item.q.id), 'Mi repaso aprende de la respuesta del juego');
  });
  db.close();
});
