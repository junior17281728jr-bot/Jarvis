// Academia 0.9.0: el «Instructor» SIN IA (siempre funciona, sin costo): el modelo del alumno (dominio, la misma opción
// mala repetida, la prisa, la hora, Test Guide contra Modo reto), «Tu instructor dice…» con un siguiente paso, la Práctica
// del instructor (repaso espaciado, lo débil primero, mezclada), «Explícamelo de otra forma» con la idea equivocada EXACTA
// que eligió, las dudas por tema, que un alumno nunca ve lo de otro, la revisión del Modo reto (opciones fáciles) y
// scripts/reto-faciles.mjs. Usa solo el paquete de MUESTRA (test/academia-muestra.js).
import { configDePrueba, conServidor, carpetaTemporal } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { revisarReto, retosFaciles, normalizar } from '../src/academia/reto-calidad.js';
import { intercalar } from '../src/academia/practica.js';
import { estiloDe, tarjetaPara } from '../src/academia/instructor.js';
import { semanaDe } from '../src/api/instructor.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const T0 = Date.parse('2026-11-12T14:00:00Z'); // 10:00 a. m. en Santo Domingo

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
// Un reloj que avanza solo lo que la prueba diga (así se sabe cuánto tardó cada respuesta).
function relojDePrueba(inicio = T0) {
  let ahora = inicio;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  return reloj;
}
async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const reloj = relojDePrueba();
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const alumnos = {};
    for (const nombre of ['ana', 'beto']) {
      crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    assert.ok(Array.isArray(s.datos.avisos), 'la subida dice los avisos del Modo reto');
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    await fn({ base, db, reloj, admin: admin.galleta, ...alumnos });
  });
  db.close();
}
const nuevo = (base, galleta, datos) => pedir(base, 'POST', '/api/academia/intentos', { galleta, datos });
const responder = (base, galleta, intento, pregunta, elegida) => pedir(base, 'POST', `/api/academia/intentos/${intento}/responder`, { galleta, datos: { pregunta, elegida } });
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);
// Responde un intento entero: bien las primeras «bien», mal (la primera opción incorrecta) las demás, con «cada» ms entre una y otra.
async function responderTodo(c, galleta, intento, { bien = 0, cada = 20_000 } = {}) {
  let n = 0;
  for (const q of intento.preguntas) {
    c.reloj.avanzar(cada);
    const letra = n < bien ? DE(q.id).original.correcta : mala(q.id);
    assert.equal((await responder(c.base, galleta, intento.id, q.id, letra)).codigo, 200);
    n += 1;
  }
  return pedir(c.base, 'POST', `/api/academia/intentos/${intento.id}/terminar`, { galleta, datos: {} });
}

test('instructor sin IA: un alumno nuevo ve «modo básico (sin IA)» y el primer paso concreto', async () => {
  await conAcademia(async c => {
    const r = await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana });
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos.instructor, { modo: 'basico', motivo: 'ia_apagada' });
    assert.equal(r.datos.consejo.clave, 'empieza');
    assert.deepEqual(r.datos.consejo.accion, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.equal(r.datos.modelo.respuestas, 0);
    assert.equal(r.datos.consejoIa, null);
    // Sin sesión: no entra.
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor')).codigo, 401);
  });
});

test('instructor sin IA: la misma opción mala dos veces → «Has elegido … la idea que te confunde», con la tarjeta que la explica', async () => {
  await conAcademia(async c => {
    for (let vez = 0; vez < 2; vez++) {
      const i = (await nuevo(c.base, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
      await responderTodo(c, c.ana, i, { bien: 0 });
    }
    const r = (await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos;
    assert.equal(r.consejo.clave, 'repite');
    assert.equal(r.consejo.vars.veces, 2);
    const q = DE(r.consejo.vars.numero ? MUESTRA.preguntas.find(x => x.original.numero === r.consejo.vars.numero).id : 'muestra-h1');
    // La idea es la del paquete para ESA opción, tal cual; la opción, su texto tal cual.
    assert.equal(r.consejo.vars.idea, q.errores[mala(q.id)]);
    assert.equal(r.consejo.vars.opcion, q.original.opciones.find(o => o.letra === mala(q.id)).texto);
    assert.ok(r.consejo.vars.tarjeta, 'nombra la tarjeta que hay que releer');
    assert.deepEqual(r.consejo.accion, { tipo: 'intento', datos: { tipo: 'errores', materia: 'factores_humanos', tema: 'muestra-hipoxia' } });
    assert.equal(r.modelo.estilo, 'paso_a_paso', 'le cuesta: se le explica paso a paso');
    // Al empezar el tema: su error de ese tema y la tarjeta.
    const t = (await pedir(c.base, 'GET', '/api/academia/instructor?materia=factores_humanos&tema=muestra-hipoxia', { galleta: c.ana })).datos;
    assert.equal(t.consejo.clave, 'tema_error');
    assert.ok(t.consejo.tarjeta?.titulo);
    // Beto no ve nada de Ana: para él sigue el primer paso.
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.beto })).datos.consejo.clave, 'empieza');
  });
});

test('instructor sin IA: fallar en pocos segundos es «con prisa» (y el estilo pasa a un ejemplo de vuelo)', async () => {
  await conAcademia(async c => {
    const i = (await nuevo(c.base, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    c.reloj.avanzar(1000);
    await responderTodo(c, c.ana, i, { bien: 1, cada: 2000 });
    const r = (await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos;
    assert.equal(r.modelo.prisa, true);
    assert.equal(r.modelo.estilo, 'ejemplo');
    assert.equal(r.consejo.clave, 'prisa');
    assert.equal(r.consejo.vars.n, 4);
    assert.ok(r.observaciones.some(o => o.clave === 'rapidas' && o.vars.n === 4));
    // Despacio no es prisa.
    const j = (await nuevo(c.base, c.beto, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    await responderTodo(c, c.beto, j, { bien: 1, cada: 30_000 });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.beto })).datos.modelo.prisa, false);
  });
});

test('Práctica del instructor: lo que vence primero, lo débil, después lo nuevo, mezclado; opciones originales y no aprueba nada', async () => {
  await conAcademia(async c => {
    const i = (await nuevo(c.base, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    const r = await responderTodo(c, c.ana, i, { bien: 5 }); // aprueba el tema 1 (abre el 2)
    assert.equal(r.datos.aprobado, true);
    const j = (await nuevo(c.base, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-ilusiones' })).datos;
    await responderTodo(c, c.ana, j, { bien: 3 }); // falla 2 del tema 2 → van al repaso de hoy
    const falladas = j.preguntas.slice(3).map(q => q.id);
    const p = await nuevo(c.base, c.ana, { tipo: 'instructor' });
    assert.equal(p.codigo, 201);
    assert.equal(p.datos.tipo, 'instructor');
    assert.equal(p.datos.modo, 'original');
    const ids = p.datos.preguntas.map(q => q.id);
    assert.ok(falladas.includes(ids[0]) && falladas.every(id => ids.slice(0, 3).includes(id)), `primero lo que vence hoy: ${ids.join(',')}`);
    assert.equal(ids.length, 10);
    // Mezclada: nunca dos seguidas del mismo tema cuando se puede evitar (hay 5 de cada tema).
    const temaDe = id => (id.startsWith('muestra-h') ? 'h' : 'v');
    for (let k = 1; k < ids.length; k++) assert.notEqual(temaDe(ids[k]), temaDe(ids[k - 1]), `dos seguidas del mismo tema: ${ids.join(',')}`);
    // Las opciones son las del Test Guide, tal cual y en su orden.
    for (const q of p.datos.preguntas) assert.deepEqual(q.opciones, DE(q.id).original.opciones.map(o => ({ letra: o.letra, texto: o.texto })));
    // Terminarla no aprueba nada.
    const fin = await responderTodo(c, c.ana, p.datos, { bien: 10 });
    assert.equal(fin.datos.aprobado, null);
    assert.equal(fin.datos.tipo, 'instructor');
    // Otra vez: igual hay práctica (con lo que respondió hace más tiempo).
    assert.equal((await nuevo(c.base, c.ana, { tipo: 'instructor' })).codigo, 201);
  });
});

test('intercalar: respeta la prioridad y separa los temas', () => {
  const tema = id => id[0];
  assert.deepEqual(intercalar(['a1', 'a2', 'b1', 'a3', 'b2'], tema), ['a1', 'b1', 'a2', 'b2', 'a3']);
  assert.deepEqual(intercalar(['a1', 'a2'], tema), ['a1', 'a2']);
  assert.deepEqual(intercalar([], tema), []);
});

test('«Explícamelo de otra forma» sin IA: la idea EXACTA de la opción que eligió, solo de SU respuesta, nunca antes de responder', async () => {
  await conAcademia(async c => {
    const i = (await nuevo(c.base, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    const q = i.preguntas[0];
    // Antes de responder: no existe (así nunca se puede sacar la respuesta antes).
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.ana, datos: { intento: i.id, pregunta: q.id } })).codigo, 404);
    await responder(c.base, c.ana, i.id, q.id, mala(q.id));
    const r = await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.ana, datos: { intento: i.id, pregunta: q.id, ia: true } });
    assert.equal(r.codigo, 200);
    const b = r.datos.basica;
    assert.equal(b.idea, DE(q.id).errores[mala(q.id)]);
    assert.equal(b.sencilla, DE(q.id).sencilla);
    assert.equal(b.correcta, DE(q.id).original.opciones.find(o => o.letra === DE(q.id).original.correcta).texto);
    assert.equal(b.elegidaTexto, DE(q.id).original.opciones.find(o => o.letra === mala(q.id)).texto);
    assert.equal(b.acierto, false);
    assert.ok(b.tarjeta && typeof b.tarjeta.titulo === 'string', 'la tarjeta de la lección que lo explica');
    assert.ok(!('opciones' in b) && !('enunciado' in b), 'nunca reescribe la pregunta ni sus opciones');
    // Con la IA apagada: dice por qué y no pone nada en la fila ni gasta.
    assert.deepEqual(r.datos.ia, { estado: 'no', motivo: 'ia_apagada' });
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.instructor'").get().n, 0);
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, 0);
    // El intento de otro: 404. La opción nunca se toma de la pantalla.
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.beto, datos: { intento: i.id, pregunta: q.id } })).codigo, 404);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.ana, datos: { intento: String(i.id), pregunta: q.id } })).codigo, 400);
    // En Modo reto: la trampa del reto.
    const reto = (await nuevo(c.base, c.ana, { tipo: 'reto', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    const qr = reto.preguntas[0];
    const correctaTexto = DE(qr.id).original.opciones.find(o => o.letra === DE(qr.id).original.correcta).texto;
    const letraMala = qr.opciones.find(o => o.texto !== correctaTexto).letra;
    await responder(c.base, c.ana, reto.id, qr.id, letraMala);
    const br = (await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.ana, datos: { intento: reto.id, pregunta: qr.id } })).datos.basica;
    const opcionReto = DE(qr.id).reto.opciones.find(o => o.texto === qr.opciones.find(x => x.letra === letraMala).texto);
    assert.equal(br.modo, 'reto');
    assert.equal(br.idea, opcionReto.trampa || opcionReto.porque_es_incorrecta);
    assert.equal(br.elegidaTexto, opcionReto.texto);
  });
});

test('dudas sin IA: la tarjeta del tema que más se parece; un tema cerrado no; textos raros no', async () => {
  await conAcademia(async c => {
    const r = await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.ana, datos: { materia: 'factores_humanos', tema: 'muestra-hipoxia', texto: '¿Qué hacer si noto la hipoxia?' } });
    assert.equal(r.codigo, 200);
    assert.ok(r.datos.basica.tarjeta);
    assert.deepEqual(r.datos.ia, { estado: 'no', motivo: 'ia_apagada' });
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.ana, datos: { materia: 'factores_humanos', tema: 'muestra-ilusiones', texto: 'una duda' } })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.ana, datos: { materia: 'factores_humanos', tema: 'muestra-hipoxia', texto: 'x' } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.ana, datos: { materia: 'factores_humanos', tema: 'muestra-hipoxia', texto: 'y'.repeat(501) } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.ana, datos: { materia: 'factores_humanos', tema: 'no-existe', texto: 'una duda' } })).codigo, 404);
  });
});

test('un alumno nunca ve las tareas del instructor de otro, ni la lista del administrador', async () => {
  await conAcademia(async c => {
    const anaId = c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'ana'").get().id;
    const espacio = c.db.prepare('SELECT espacio_id FROM miembros WHERE usuario_id = ?').get(anaId).espacio_id;
    const t = c.db.prepare(`INSERT INTO tareas (tipo, espacio_id, carril_espacio, cupo, prioridad, repetible, estado, datos, max_fallos, disponible_en, creada_por, creada_en, actualizada_en)
      VALUES ('academia.instructor', ?, ?, 'normal', 6, 1, 'hecha', '{}', 1, ?, ?, ?, ?)`).run(espacio, `e${espacio}`, new Date(T0).toISOString(), anaId, new Date(T0).toISOString(), new Date(T0).toISOString());
    const id = Number(t.lastInsertRowid);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${id}`, { galleta: c.ana })).codigo, 200);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${id}`, { galleta: c.beto })).codigo, 404);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor/tareas/abc', { galleta: c.ana })).codigo, 404);
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/instructor', { galleta: c.ana })).codigo, 403);
    const a = await pedir(c.base, 'GET', '/api/admin/academia/instructor', { galleta: c.admin, cabeceras: DESDE_TAILSCALE });
    assert.equal(a.codigo, 200);
    assert.equal(a.datos.encendido, false);
    assert.ok(a.datos.alumnos.every(x => x.modo === 'basico'));
  });
});

test('el modelo elige el estilo y la tarjeta (puro)', () => {
  assert.equal(estiloDe({ respuestas: 30, pct: 90, prisa: { activa: true }, repetidas: [] }), 'tecnico');
  assert.equal(estiloDe({ respuestas: 10, pct: 70, prisa: { activa: true }, repetidas: [] }), 'ejemplo');
  assert.equal(estiloDe({ respuestas: 10, pct: 40, prisa: { activa: false }, repetidas: [] }), 'paso_a_paso');
  assert.equal(estiloDe({ respuestas: 2, pct: 0, prisa: { activa: false }, repetidas: [] }), 'claro');
  const tema = { secciones: [{ titulo: 'Motor', texto: 'El motor gira.' }, { titulo: 'Hipoxia', texto: 'Falta de oxígeno en la altura.' }] };
  assert.equal(tarjetaPara(tema, 'oxígeno altura').titulo, 'Hipoxia');
  assert.equal(tarjetaPara(tema, 'nada que ver'), null);
  assert.equal(semanaDe(Date.parse('2026-11-12T14:00:00Z')), '2026-11-09');
  assert.equal(semanaDe(Date.parse('2026-11-16T03:00:00Z')), '2026-11-09', 'domingo de noche en Santo Domingo sigue en la misma semana');
});

test('Modo reto: las opciones fáciles se avisan (largo, absolutos, cifras, unidades, fuera de tema) sin tocar lo del Test Guide', () => {
  const q = {
    id: 'x', original: { enunciado: '¿Cuánto tiempo hay para avisar a la FAA de una condena por alcohol?', opciones: [{ letra: 'A', texto: 'No más tarde de 60 días después de la acción.' }, { letra: 'B', texto: 'A más tardar 30 días hábiles.' }, { letra: 'C', texto: 'Al renovar el certificado médico.' }], correcta: 'A', explicacion: 'Según 61.15, 60 días.' },
    sencilla: 'El plazo es 60 días.',
    reto: { opciones: [{ texto: 'Siempre.', porque_es_incorrecta: 'x' }, { texto: 'No más tarde de 90 días después de la acción.', porque_es_incorrecta: 'x' }] },
  };
  const copia = structuredClone(q);
  const r = revisarReto(q);
  assert.deepEqual(r.map(x => [x.indice, x.motivos]), [[0, ['muy_corta', 'absoluto', 'sin_cifras']]]);
  assert.deepEqual(q, copia, 'nunca cambia nada');
  q.reto.opciones[0].texto = 'Un girasol amarillo florece junto al jardín botánico.';
  assert.ok(revisarReto(q)[0].motivos.includes('fuera_de_tema'));
  q.reto.opciones[0].texto = 'No más tarde de 60 metros después de la acción.';
  assert.deepEqual(revisarReto(q).map(x => x.motivos), [['otra_unidad']]);
  q.reto.opciones[0].texto = 'El otro piloto que vuela en la misma dirección que usted, mucho más adelante de usted y más alto también.';
  assert.ok(revisarReto(q)[0].motivos.includes('muy_larga'));
  assert.equal(normalizar('¿Sí, SIEMPRE?'), 'si siempre');
  // El revisor: la MISMA frase que una original (sin mirar mayúsculas, tildes ni signos) es error; lo demás, avisos.
  const p = paqueteMuestra();
  assert.equal(revisarPaquete(p).ok, true);
  assert.ok(Array.isArray(revisarPaquete(p).avisos));
  const o = p.preguntas[0];
  o.reto.opciones[0].texto = `¡${o.original.opciones.find(x => x.letra !== o.original.correcta).texto.toUpperCase()}!`;
  assert.deepEqual(revisarPaquete(p).errores.map(e => `${e.ruta}:${e.motivo}`), ['preguntas[0].reto.opciones[0].texto:repetido']);
  const p2 = paqueteMuestra();
  p2.preguntas[0].reto.opciones[0].texto = 'Nunca, jamás, en ningún caso posible dentro de esta materia aeronáutica.';
  const v = revisarPaquete(p2);
  assert.equal(v.ok, true, 'un aviso no impide subirlo');
  assert.ok(v.avisos.some(a => a.ruta === 'preguntas[0].reto.opciones[0].texto' && a.motivo === 'absoluto'));
  assert.ok(retosFaciles(p2).some(x => x.pregunta === p2.preguntas[0].id));
});

test('scripts/reto-faciles.mjs: lista las opciones fáciles de un paquete (texto, Markdown y JSON) sin cambiarlo', () => {
  const carpeta = carpetaTemporal('reto-faciles');
  const p = paqueteMuestra();
  p.preguntas[0].reto.opciones[0].texto = 'Siempre, en todo momento y en cualquier vuelo que se haga con el avión.';
  const archivo = join(carpeta, 'muestra.json');
  const texto = JSON.stringify(p);
  writeFileSync(archivo, texto);
  const correr = (...args) => spawnSync(process.execPath, ['--no-warnings', join(RAIZ, 'scripts', 'reto-faciles.mjs'), archivo, ...args], { encoding: 'utf8' });
  const r = correr('--json');
  assert.equal(r.status, 1, r.stderr);
  const lista = JSON.parse(r.stdout);
  assert.ok(lista.lista.some(x => x.pregunta === p.preguntas[0].id && x.opciones[0].motivos.includes('absoluto')));
  assert.match(correr('--md').stdout, /^# Opciones del Modo reto que parecen fáciles/);
  assert.equal(readFileSync(archivo, 'utf8'), texto, 'no cambia el paquete');
  writeFileSync(archivo, '{ roto');
  assert.equal(correr().status, 2);
});

test('las frases del instructor (public/instructor.js y los consejos) existen en los dos idiomas, y sin innerHTML', () => {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
  const js = readFileSync(join(RAIZ, 'public/instructor.js'), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
  const claves = [...js.matchAll(/\btx\('([a-z0-9_.]+)'/g)].map(m => m[1]);
  const fuente = readFileSync(join(RAIZ, 'src/academia/instructor.js'), 'utf8');
  for (const m of fuente.matchAll(/clave: '([a-z_]+)'/g)) claves.push(`instr.c.${m[1]}`, `instr.o.${m[1]}`);
  for (const modo of ['basico', 'ia', 'espera']) claves.push(`instr.modo.${modo}`, `instr.modo.${modo}.corto`, `instr.modo.${modo}.ayuda`);
  for (const a of ['instructor', 'errores', 'reto', 'tema', 'examen']) claves.push(`instr.accion.${a}`);
  for (const f of ['madrugada', 'manana', 'tarde', 'noche']) claves.push(`instr.franja.${f}`);
  const api = readFileSync(join(RAIZ, 'src/api/instructor.js'), 'utf8');
  for (const m of /MOTIVOS_ALUMNO = new Set\(\[([^\]]+)\]/.exec(api)[1].matchAll(/'([a-z_]+)'/g)) claves.push(`instr.motivo.${m[1]}`);
  for (const m of /RESULTADO_ALUMNO = new Set\(\[([^\]]+)\]/.exec(api)[1].matchAll(/'([a-z_]+)'/g)) if (m[1] !== 'ok') claves.push(`instr.motivo.${m[1]}`);
  for (const clave of claves) {
    // Un consejo u observación existe en uno de los dos grupos (instr.c.* o instr.o.*), no en los dos.
    if (/^instr\.[co]\./.test(clave)) { const otra = clave.replace(/^instr\.c\./, 'instr.o.').replace(/^instr\.o\./, clave.startsWith('instr.o.') ? 'instr.c.' : 'instr.o.'); assert.ok(clave in es || otra in es, `falta ${clave}`); continue; }
    assert.ok(clave in es && clave in en, `falta ${clave}`);
  }
});
