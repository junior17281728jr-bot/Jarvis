// Pruebas de la Academia (etapa 1, 0.7.0): el formato del paquete, la subida (JSON y figuras, nunca se pisa nada), el
// camino con temas que se abren, practicar y fallar/aprobar, el repaso, el examen de materia, el progreso, lo del
// administrador y que NINGÚN alumno pueda leer lo de otro. Usa solo el paquete de MUESTRA (test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete, MATERIAS } from '../src/academia/formato.js';
import { diaDe, puntosYRacha } from '../src/academia/progreso.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const tipo = r.headers.get('content-type') || '';
  const contenido = tipo.includes('json') ? await r.json().catch(() => ({})) : Buffer.from(await r.arrayBuffer());
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, tipo, galleta: setCookie ? setCookie.split(';')[0] : null };
}

// Un azar fijo (las pruebas no dependen de la suerte).
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

// Monta un servidor con un administrador y dos alumnos (ana y beto) ya con su sesión.
async function conAcademia(fn, { reloj = Date.now } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const alumnos = {};
    for (const nombre of ['ana', 'beto']) {
      crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } });
      assert.equal(r.codigo, 200, nombre);
      alumnos[nombre] = r.galleta;
    }
    await fn({ base, db, config, admin: admin.galleta, ...alumnos });
  });
  db.close();
}

async function subirMuestra(base, admin, paquete = paqueteMuestra(), png = figuraMuestraPng()) {
  const json = JSON.stringify(paquete);
  const r = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: json });
  assert.ok([200, 201].includes(r.codigo), JSON.stringify(r.datos));
  for (const archivo of r.datos.faltan) {
    const f = await pedir(base, 'POST', `/api/admin/academia/paquetes/${r.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: png });
    assert.equal(f.codigo, 201, JSON.stringify(f.datos));
  }
  return r.datos.paquete.id;
}

async function activarMuestra(base, admin) {
  const id = await subirMuestra(base, admin);
  const a = await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} });
  assert.equal(a.codigo, 200, JSON.stringify(a.datos));
  return id;
}

// Responde todo un intento: «bien» = cuántas acertar (las primeras en el orden del intento).
async function responderTodo(base, galleta, intento, { bien }) {
  const paquete = paqueteMuestra();
  const correcta = id => paquete.preguntas.find(q => q.id === id).original.correcta;
  let n = 0;
  for (const q of intento.preguntas) {
    const letra = n < bien ? correcta(q.id) : ['A', 'B', 'C'].find(l => l !== correcta(q.id));
    const r = await pedir(base, 'POST', `/api/academia/intentos/${intento.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: letra } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.respuesta.acierto, n < bien);
    n += 1;
  }
  return pedir(base, 'POST', `/api/academia/intentos/${intento.id}/terminar`, { galleta, datos: {} });
}

test('formato: la muestra pasa; cada error dice dónde está (ruta) y qué pasa', () => {
  const bien = revisarPaquete(paqueteMuestra());
  assert.equal(bien.ok, true, JSON.stringify(bien.errores));
  assert.deepEqual(bien.resumen, { nombre: 'Paquete de muestra (no es material real)', edicion: 'muestra-1', muestra: true, materias: 1, temas: 2, preguntas: 10, figuras: 1 });
  assert.equal(MATERIAS.length, 11);
  const p = paqueteMuestra();
  p.preguntas[2].original.correcta = 'Z';
  p.preguntas[3].errores = { B: 'la correcta no puede tener idea equivocada' };
  p.materias[0].temas[1].preguntas.push('no-existe');
  p.preguntas[0].original.figura = '99';
  p.materias.push({ id: 'inventada', temas: [] });
  p.materias[0].temas[0].secciones[0].fuentes[0].libro = 'otro';
  p.preguntas.push({ ...paqueteMuestra().preguntas[0], id: 'muestra-suelta' });
  const r = revisarPaquete(p);
  assert.equal(r.ok, false);
  const errores = new Set(r.errores.map(e => `${e.ruta}:${e.motivo}`));
  for (const esperado of ['preguntas[2].original.correcta:correcta_no_es_opcion', 'preguntas[3].errores.B:no_es_opcion_incorrecta', 'materias[0].temas[1].preguntas[5]:pregunta_desconocida',
    'preguntas[0].original.figura:figura_desconocida', 'materias[1].id:materia_desconocida', 'materias[0].temas[0].secciones[0].fuentes[0].libro:libro_desconocido', 'preguntas[10]:pregunta_sin_tema']) {
    assert.ok(errores.has(esperado), `falta el error ${esperado}: ${[...errores].join(', ')}`);
  }
  // Las materias van en el orden fijo de ENALAS.
  const fuera = paqueteMuestra();
  fuera.materias = [{ id: 'sms', temas: [] }, { id: 'factores_humanos', temas: fuera.materias[0].temas }];
  assert.ok(revisarPaquete(fuera).errores.some(e => e.ruta === 'materias[1].id' && e.motivo === 'fuera_de_orden'));
  // Una pregunta del POH necesita de dónde sale.
  const poh = paqueteMuestra();
  poh.preguntas[0].origen = 'poh';
  assert.ok(revisarPaquete(poh).errores.some(e => e.ruta === 'preguntas[0].fuente'));
});

test('subir: JSON revisado antes de escribir; figuras por partes; nunca se pisa nada; versiones guardadas, una en uso', async () => {
  await conAcademia(async ({ base, config, admin, ana }) => {
    // Un paquete mal armado: 422 con sus errores, y nada en el disco.
    const malo = paqueteMuestra();
    malo.version = 2;
    const r1 = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, datos: malo });
    assert.equal(r1.codigo, 422);
    assert.deepEqual(r1.datos.errores, [{ ruta: 'version', motivo: 'version_desconocida' }]);
    const carpeta = join(dirname(config.archivoBase), 'academia');
    assert.ok(!existsSync(join(carpeta, 'paquetes')) || readdirSync(join(carpeta, 'paquetes')).length === 0);
    // Un alumno no puede subir nada.
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: ana, datos: paqueteMuestra() })).codigo, 403);
    // El bueno: queda «incompleto» hasta que llega la figura.
    const json = JSON.stringify(paqueteMuestra());
    const r2 = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: json });
    assert.equal(r2.codigo, 201);
    assert.equal(r2.datos.paquete.estado, 'incompleto');
    assert.deepEqual(r2.datos.faltan, ['figura-m1.png']);
    const id = r2.datos.paquete.id;
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 409, 'incompleto no se pone en uso');
    // Una figura que no es PNG, una que el paquete no nombra y un nombre raro: no.
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/figura-m1.png`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: Buffer.from('no soy una imagen') })).codigo, 422);
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/otra.png`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() })).codigo, 400);
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/..%2Fpaquete.json`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() })).codigo, 400);
    const f = await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/figura-m1.png`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal(f.codigo, 201);
    assert.equal(f.datos.paquete.estado, 'listo');
    // Otra vez la misma figura (con otra imagen): no se pisa.
    const otraImagen = figuraMuestraPng(100, 60);
    const again = await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/figura-m1.png`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: otraImagen });
    assert.equal(again.codigo, 200);
    assert.equal(again.datos.ya, true);
    const dirPaquete = join(carpeta, 'paquetes', readdirSync(join(carpeta, 'paquetes'))[0]);
    assert.ok(readFileSync(join(dirPaquete, 'figuras', 'figura-m1.png')).equals(figuraMuestraPng()));
    // El JSON queda tal cual se subió (byte a byte).
    assert.equal(readFileSync(join(dirPaquete, 'paquete.json'), 'utf8'), json);
    // El mismo JSON otra vez: la misma versión (no una copia).
    const r3 = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: json });
    assert.equal(r3.codigo, 200);
    assert.equal(r3.datos.repetido, true);
    assert.equal(r3.datos.paquete.id, id);
    // Una edición nueva: otra versión, en otra carpeta; la primera sigue igual.
    const huellaAntes = createHash('sha256').update(readFileSync(join(dirPaquete, 'paquete.json'))).digest('hex');
    const nueva = paqueteMuestra();
    nueva.edicion = 'muestra-2';
    const id2 = await subirMuestra(base, admin, nueva);
    assert.notEqual(id2, id);
    assert.equal(readdirSync(join(carpeta, 'paquetes')).length, 2);
    assert.equal(createHash('sha256').update(readFileSync(join(dirPaquete, 'paquete.json'))).digest('hex'), huellaAntes);
    // Poner en uso: solo una a la vez.
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id2}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    const lista = await pedir(base, 'GET', '/api/admin/academia', { galleta: admin });
    assert.deepEqual(lista.datos.paquetes.map(p => [p.id, p.activo]), [[id2, true], [id, false]]);
    // Un JSON demasiado grande se corta antes de leerlo entero.
    const enorme = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: Buffer.alloc(13 * 1024 * 1024, 32) }).catch(() => ({ codigo: 413 }));
    assert.equal(enorme.codigo, 413);
    // Ningún archivo .part quedó a medias de la figura buena.
    assert.ok(!readdirSync(join(dirPaquete, 'figuras')).includes('figura-m1.png.part') || statSync(join(dirPaquete, 'figuras', 'figura-m1.png')).size > 0);
  });
});

test('sin paquete: el alumno ve el camino vacío (sin errores) y el nombre de la app sale de los ajustes', async () => {
  await conAcademia(async ({ base, admin, ana }) => {
    const c = await pedir(base, 'GET', '/api/academia/camino', { galleta: ana });
    assert.equal(c.codigo, 200);
    assert.equal(c.datos.paquete, null);
    assert.equal(c.datos.nombre, 'Academia ENALAS');
    assert.equal(c.datos.umbral, 90);
    assert.equal((await pedir(base, 'GET', '/api/setup')).datos.nombreApp, 'Academia ENALAS');
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'repaso' } })).codigo, 409);
    // Solo el administrador cambia el nombre y el %.
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: ana, datos: { umbral: 50 } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: admin, datos: { umbral: 20 } })).codigo, 400);
    const r = await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: admin, datos: { nombre: 'Escuela de Junior', umbral: 80 } });
    assert.deepEqual(r.datos.ajustes, { nombre: 'Escuela de Junior', umbral: 80 });
    assert.equal((await pedir(base, 'GET', '/api/setup')).datos.nombreApp, 'Escuela de Junior');
  });
});

test('camino y tema: lección con sus fuentes, preguntas tal cual sin la respuesta, fallar, repasar y aprobar con otro orden', async () => {
  await conAcademia(async ({ base, ana }) => {
    // Sin entrar no se ve nada.
    assert.equal((await pedir(base, 'GET', '/api/academia/camino')).codigo, 401);
  });
  await conAcademia(async ({ base, admin, ana }) => {
    await activarMuestra(base, admin);
    const c = await pedir(base, 'GET', '/api/academia/camino', { galleta: ana });
    assert.equal(c.datos.materias.length, 11);
    assert.deepEqual(c.datos.materias.map(m => m.id), MATERIAS);
    const fh = c.datos.materias[0];
    assert.deepEqual(fh.temas.map(t => t.estado), ['abierto', 'bloqueado']);
    assert.equal(fh.examen.disponible, false);
    assert.ok(c.datos.materias.slice(1).every(m => m.estado === 'vacia'));
    // El segundo tema está cerrado: ni su lección ni sus preguntas.
    assert.equal((await pedir(base, 'GET', '/api/academia/temas/factores_humanos/muestra-ilusiones', { galleta: ana })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-ilusiones' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'examen', materia: 'factores_humanos' } })).codigo, 403);
    // La lección: secciones con libro, capítulo, sección y página.
    const l = await pedir(base, 'GET', '/api/academia/temas/factores_humanos/muestra-hipoxia', { galleta: ana });
    assert.equal(l.codigo, 200);
    assert.equal(l.datos.secciones.length, 3);
    assert.deepEqual(l.datos.secciones[0].fuentes[0], { libro: 'Libro de muestra (inventado para las pruebas)', capitulo: 'Capítulo de muestra', seccion: 'Muestra', pagina: '1' });
    assert.equal(l.datos.secciones[0].texto, paqueteMuestra().materias[0].temas[0].secciones[0].texto, 'el texto llega tal cual (con su salto de línea)');
    // Practicar: las 5 preguntas del tema, tal cual, sin la respuesta.
    const i1 = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
    assert.equal(i1.total, 5);
    const crudo = JSON.stringify(i1);
    assert.doesNotMatch(crudo, /"correcta"|Explicación de la muestra|sencilla|"errores"/, 'la respuesta no viaja antes de responder');
    const original = paqueteMuestra().preguntas.find(q => q.id === i1.preguntas[0].id).original;
    assert.equal(i1.preguntas[0].enunciado, original.enunciado);
    assert.deepEqual(i1.preguntas[0].opciones, original.opciones, 'las opciones en su orden original');
    const conFigura = i1.preguntas.find(q => q.figura);
    assert.deepEqual(conFigura.figura, { numero: 'M1', titulo: 'Figura M1 (muestra): cielo, horizonte y pista' });
    // La figura se ve con la sesión, y solo con la sesión.
    const img = await pedir(base, 'GET', '/api/academia/figuras/M1', { galleta: ana });
    assert.equal(img.codigo, 200);
    assert.equal(img.tipo, 'image/png');
    assert.ok(img.datos.equals(figuraMuestraPng()));
    assert.equal((await pedir(base, 'GET', '/api/academia/figuras/M1')).codigo, 401);
    // Una respuesta: dice si acertó, la explicación ORIGINAL, la sencilla y la idea equivocada de la opción elegida.
    const q = i1.preguntas[0];
    const correcta = paqueteMuestra().preguntas.find(x => x.id === q.id);
    const mala = ['A', 'B', 'C'].find(x => x !== correcta.original.correcta);
    const r = await pedir(base, 'POST', `/api/academia/intentos/${i1.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida: mala } });
    assert.equal(r.datos.respuesta.acierto, false);
    assert.equal(r.datos.respuesta.correcta, correcta.original.correcta);
    assert.equal(r.datos.respuesta.explicacion, correcta.original.explicacion);
    assert.equal(r.datos.respuesta.sencilla, correcta.sencilla);
    assert.equal(r.datos.respuesta.idea, correcta.errores[mala]);
    // Un segundo toque no cambia la respuesta.
    const otra = await pedir(base, 'POST', `/api/academia/intentos/${i1.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida: correcta.original.correcta } });
    assert.equal(otra.datos.respuesta.acierto, false);
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i1.id}/terminar`, { galleta: ana, datos: {} })).codigo, 409, 'faltan respuestas');
    // 4 de 5 = 80 %: no llega al 90 %.
    for (const x of i1.preguntas.slice(1)) {
      const c2 = paqueteMuestra().preguntas.find(y => y.id === x.id).original.correcta;
      await pedir(base, 'POST', `/api/academia/intentos/${i1.id}/responder`, { galleta: ana, datos: { pregunta: x.id, elegida: c2 } });
    }
    const fin1 = (await pedir(base, 'POST', `/api/academia/intentos/${i1.id}/terminar`, { galleta: ana, datos: {} })).datos;
    assert.equal(fin1.pct, 80);
    assert.equal(fin1.aprobado, false);
    assert.equal(fin1.falladas.length, 1);
    assert.equal(fin1.falladas[0].respuesta.idea, correcta.errores[mala]);
    assert.equal(fin1.reexplicacion.length, 1, 'se vuelve a explicar más fácil');
    // La fallada queda en el repaso; el siguiente tema sigue cerrado.
    const c2 = await pedir(base, 'GET', '/api/academia/camino', { galleta: ana });
    assert.equal(c2.datos.repaso, 1);
    assert.deepEqual(c2.datos.materias[0].temas.map(t => t.estado), ['abierto', 'bloqueado']);
    assert.equal(c2.datos.materias[0].temas[0].mejor, 80);
    // Otra vez: las MISMAS preguntas, en otro orden.
    const i2 = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
    assert.deepEqual(i2.preguntas.map(x => x.id).sort(), i1.preguntas.map(x => x.id).sort());
    assert.notDeepEqual(i2.preguntas.map(x => x.id), i1.preguntas.map(x => x.id));
    const fin2 = (await responderTodo(base, ana, i2, { bien: 5 })).datos;
    assert.equal(fin2.aprobado, true);
    assert.equal(fin2.pct, 100);
    assert.equal(fin2.puntos, 50);
    const c3 = await pedir(base, 'GET', '/api/academia/camino', { galleta: ana });
    assert.deepEqual(c3.datos.materias[0].temas.map(t => t.estado), ['aprobado', 'abierto']);
    assert.ok(c3.datos.racha >= 1);
    assert.equal(c3.datos.puntos, 90);
    // Acertar en el tema la sube de caja: ya no vence hoy.
    assert.equal(c3.datos.repaso, 0);
  });
});

test('repaso espaciado, examen de materia (todas sus preguntas, mezcladas) y progreso', async () => {
  let ahora = Date.parse('2026-11-11T15:00:00Z');
  await conAcademia(async ({ base, admin, ana }) => {
    await activarMuestra(base, admin);
    const nuevo = datos => pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos });
    // Tema 1 con 2 fallos (60 %), luego aprobado; tema 2 aprobado.
    const a = (await nuevo({ tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    assert.equal((await responderTodo(base, ana, a, { bien: 3 })).datos.aprobado, false);
    const camino1 = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.equal(camino1.repaso, 2);
    // El repaso: solo las 2 falladas.
    const rep = (await nuevo({ tipo: 'repaso' })).datos;
    assert.equal(rep.total, 2);
    const finRep = (await responderTodo(base, ana, rep, { bien: 2 })).datos;
    assert.equal(finRep.aprobado, null, 'el repaso no se aprueba ni se reprueba');
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.repaso, 0);
    // Pasados 2 días vuelven a tocar (caja 2 = 1 día).
    ahora += 2 * 24 * 3600 * 1000;
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.repaso, 2);
    for (const tema of ['muestra-hipoxia', 'muestra-ilusiones']) {
      const i = (await nuevo({ tipo: 'tema', materia: 'factores_humanos', tema })).datos;
      assert.equal((await responderTodo(base, ana, i, { bien: 5 })).datos.aprobado, true, tema);
    }
    const c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.equal(c.materias[0].estado, 'aprobada');
    assert.equal(c.materias[0].examen.disponible, true);
    // El examen: las 10 preguntas de la materia, mezcladas; con 9 de 10 (90 %) aprueba.
    const ex = (await nuevo({ tipo: 'examen', materia: 'factores_humanos' })).datos;
    assert.equal(ex.total, 10);
    assert.deepEqual(ex.preguntas.map(q => q.id).sort(), paqueteMuestra().preguntas.map(q => q.id).sort());
    const finEx = (await responderTodo(base, ana, ex, { bien: 9 })).datos;
    assert.equal(finEx.pct, 90);
    assert.equal(finEx.aprobado, true);
    const p = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana })).datos;
    const fh = p.materias.find(m => m.id === 'factores_humanos');
    assert.equal(fh.preguntas, 10);
    assert.equal(fh.bien, 9);
    assert.equal(fh.mal, 1);
    assert.equal(fh.pct, 90);
    assert.equal(fh.examen.aprobado, true);
    assert.ok(p.debiles.length >= 1, 'la última fallada es débil');
    assert.ok(p.racha >= 1);
  }, { reloj: () => ahora });
});

test('racha: días seguidos en Santo Domingo; un día sin estudiar la corta', () => {
  const db = abrirBase(configDePrueba());
  db.prepare("INSERT INTO usuarios (nombre, clave_hash, creado_en) VALUES ('x', 'h', '2026-01-01')").run();
  db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, empezado_en) VALUES (1, 'repaso', '2026-01-01')").run();
  const poner = iso => db.prepare('INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, elegida, correcta, dia, creada_en) VALUES (1, 1, ?, ?, 1, ?, ?)').run('q', 'A', diaDe(Date.parse(iso)), iso);
  // 23:30 de Santo Domingo del día 9 es el día 10 en UTC: cuenta como el 9.
  assert.equal(diaDe(Date.parse('2026-11-10T03:30:00Z')), '2026-11-09');
  for (const iso of ['2026-11-08T15:00:00Z', '2026-11-10T03:30:00Z', '2026-11-10T15:00:00Z', '2026-11-11T12:00:00Z']) poner(iso);
  assert.equal(puntosYRacha(db, 1, Date.parse('2026-11-11T20:00:00Z')).racha, 4);
  assert.equal(puntosYRacha(db, 1, Date.parse('2026-11-12T20:00:00Z')).racha, 4, 'hoy todavía no estudió: la de ayer sigue');
  assert.equal(puntosYRacha(db, 1, Date.parse('2026-11-13T20:00:00Z')).racha, 0);
  assert.equal(puntosYRacha(db, 1, Date.parse('2026-11-11T20:00:00Z')).puntos, 40);
  db.close();
});

test('ningún alumno lee lo de otro: intentos ajenos «no existen» y las rutas del administrador dicen que no', async () => {
  await conAcademia(async ({ base, admin, ana, beto }) => {
    await activarMuestra(base, admin);
    const i = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
    await responderTodo(base, ana, i, { bien: 2 });
    // Beto no ve, no responde y no termina el intento de Ana.
    assert.equal((await pedir(base, 'GET', `/api/academia/intentos/${i.id}`, { galleta: beto })).codigo, 404);
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: beto, datos: { pregunta: i.preguntas[0].id, elegida: 'A' } })).codigo, 404);
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: beto, datos: {} })).codigo, 404);
    // Ni las listas del administrador.
    for (const ruta of ['/api/admin/academia', '/api/admin/academia/alumnos', '/api/admin/academia/alumnos/2', '/api/admin/academia/alumnos/1', '/api/admin/usuarios']) {
      const r = await pedir(base, 'GET', ruta, { galleta: beto });
      assert.equal(r.codigo, 403, ruta);
      assert.deepEqual(r.datos, { error: 'solo_admin' }, ruta);
    }
    // Su progreso es solo el suyo (vacío), aunque mande el id de Ana.
    const p = await pedir(base, 'GET', '/api/academia/progreso?usuario=2', { galleta: beto });
    assert.equal(p.datos.materias[0].respuestas, 0);
    assert.equal(p.datos.debiles.length, 0);
    assert.equal(p.datos.puntos, 0);
    const c = await pedir(base, 'GET', '/api/academia/camino', { galleta: beto });
    assert.equal(c.datos.materias[0].temas[0].mejor, null);
    // El administrador sí: quién está en línea, su última actividad, % por materia y las falladas.
    const lista = (await pedir(base, 'GET', '/api/admin/academia/alumnos', { galleta: admin })).datos.alumnos;
    const deAna = lista.find(a => a.nombre === 'ana');
    assert.equal(deAna.enLinea, true);
    assert.ok(deAna.ultimaActividad);
    assert.equal(deAna.respuestas, 5);
    assert.equal(deAna.aciertos, 2);
    assert.equal(deAna.errores, 3);
    assert.deepEqual(deAna.materias, [{ id: 'factores_humanos', respuestas: 5, aciertos: 2, errores: 3, pct: 40 }]);
    const deBeto = lista.find(a => a.nombre === 'beto');
    assert.equal(deBeto.respuestas, 0);
    const d = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${deAna.id}`, { galleta: admin })).datos;
    assert.equal(d.falladas.length, 3);
    assert.ok(d.falladas.every(f => f.enunciado && f.fallos === 1));
    assert.equal(d.intentos[0].pct, 40);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos/999', { galleta: admin })).codigo, 404);
  });
});
