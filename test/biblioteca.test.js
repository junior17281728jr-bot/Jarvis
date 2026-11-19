// Academia 0.14.20: la Biblioteca (leer los libros de dominio público de las fuentes, con índice y búsqueda) y «Ver en el
// Test Guide» (la pregunta oficial tal cual, sin la respuesta durante un examen). Fuentes SINTÉTICAS escritas aquí (nunca
// material real) en una carpeta temporal de datos.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from './ayuda.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { carpetaFuentes } from '../src/academia/fuentes.js';
import { clasificarLibro, indiceDeCapitulo, AJUSTE_BIBLIOTECA, normalizar } from '../src/academia/biblioteca.js';
import { parrafos, resaltarBusqueda, paginaDeFuente } from '../public/biblioteca-vista.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const T0 = Date.parse('2026-11-17T14:00:00Z');
const MATERIA = 'factores_humanos';
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([30, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1'), Buffer.alloc(22, 7)]);

// La muestra con muestra-h1 numerada como una del Test Guide («5-12»): su texto oficial está en las fuentes (tg.json), con
// espacios dobles a propósito (el Test Guide manda, tal cual).
function muestra() {
  const p = paqueteMuestra();
  p.preguntas.find(q => q.id === 'muestra-h1').original.numero = '5-12';
  return p;
}
const MUESTRA = muestra();
const H1 = MUESTRA.preguntas.find(q => q.id === 'muestra-h1');
const TG_H1 = { id: '5-12', materia: MATERIA, tema: 'muestra-hipoxia', enunciado: 'En esta  muestra, ¿qué le falta al cuerpo cuando hay hipoxia? ', opciones: { A: 'Agua suficiente.', B: 'Oxígeno suficiente.', C: 'Azúcar suficiente.' }, correcta: 'B', explicacion: 'EXPLICACION-OFICIAL-SECRETA de la muestra.', referencia: 'Ref. de muestra 5-A' };

// Las fuentes de muestra: un manual «FAA», el «RAD», uno comercial (marca de editorial en el texto), uno sin confirmar,
// la Guía del examen oral (comercial) aunque el manifiesto la nombre y tenga un capítulo.
const CAP = {
  'libro-faa-muestra-cap01.txt': '=== p 1 ===\nCapítulo 1 de muestra\nLos instrumentos\n\nEl altímetro de muestra mide la al-\ntura con la presión.\n=== p 2 ===\nEl anemómetro de muestra mide la velocidad.\n=== p 3 ===\nPágina tres de muestra.\n',
  // El capítulo 2 tiene las páginas 10 y 11 (hay un hueco 4–9) y la página 10 se repite dos veces la palabra.
  'libro-faa-muestra-cap02.txt': '=== p 10 ===\nCapítulo 2 de muestra\n\nEl ALTIMETRO otra vez, en mayúsculas.\nY el altímetro una vez más.\n=== p 11 ===\nÚltima página de muestra.\n',
  'libro-rad-es-cap01.txt': '=== p 1 ===\nReglamento de muestra\nArtículo inventado para la prueba.\n',
  'libro-pp-en-cap01.txt': '=== p 17 ===\n[GFDPPM 1-1]\nA sample commercial page.\n',
  'libro-misterio-cap01.txt': '=== p 1 ===\nUn libro de muestra sin licencia conocida.\n',
  'libro-oral-en-cap01.txt': '=== p 3 ===\nSample oral guide page.\n',
};
function escribirFuentes(config) {
  const dir = carpetaFuentes(config);
  mkdirSync(join(dir, 'oral'), { recursive: true });
  writeFileSync(join(dir, 'fuentes-manifiesto.json'), JSON.stringify({
    formato: 'fuentes-academia', version: 1, tg: 'tg.json', imagenes: 'imagenes.json',
    libros: [
      { id: 'faa-muestra', titulo: "Pilot's Handbook de muestra (FAA)" },
      { id: 'rad-es', titulo: 'Material de Reglamento Aeronáutico (muestra)' },
      { id: 'pp-en', titulo: 'Manual de piloto privado (muestra, inglés)' },
      { id: 'misterio', titulo: 'Libro de muestra sin licencia' },
      { id: 'oral-en', titulo: 'Guía del examen oral (muestra)' },
    ],
    materias: [{ id: MATERIA, num: 1, nombre: 'Factores humanos (muestra)', temas: [{ id: 'muestra-hipoxia', titulo: 'Tema de muestra', tg: ['5-12'], lecturas: [{ libro: 'faa-muestra', archivo: 'libro-faa-muestra-cap01.txt', desde: 2, hasta: 3 }] }] }],
  }));
  for (const [n, texto] of Object.entries(CAP)) writeFileSync(join(dir, n), texto);
  writeFileSync(join(dir, 'tg.json'), JSON.stringify({ preguntas: [TG_H1] }));
  writeFileSync(join(dir, 'imagenes.json'), JSON.stringify([
    { archivo: 'img-faa-muestra-p1-1.webp', libro: 'faa-muestra', pagina: 1, ancho: 800, alto: 600, pie: 'Un altímetro de muestra' },
    { archivo: 'img-pp-en-p17-1.webp', libro: 'pp-en', pagina: 17, pie: 'comercial' },
  ]));
  writeFileSync(join(dir, 'img-faa-muestra-p1-1.webp'), WEBP);
  writeFileSync(join(dir, 'img-pp-en-p17-1.webp'), WEBP);
  writeFileSync(join(dir, 'oral', 'oral.json'), JSON.stringify({ libro: { id: 'oral-en', titulo: 'Guía del examen oral (muestra)' }, materias: [] }));
  return dir;
}

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const tipo = r.headers.get('content-type') ?? '';
  const crudo = Buffer.from(await r.arrayBuffer());
  const contenido = tipo.includes('json') ? JSON.parse(crudo.toString('utf8') || '{}') : crudo;
  return { codigo: r.status, datos: contenido, crudo: crudo.toString('utf8'), tipo, cache: r.headers.get('cache-control'), galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  escribirFuentes(config);
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    const alumnos = {};
    for (const nombre of ['ana', 'beto']) {
      crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    assert.equal(s.codigo, 201, JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    await fn({ base, db, config, reloj, admin, ...alumnos });
  });
  db.close();
}

// ---------- Lo puro ----------
test('clasificar: FAA y RAD se publican; editorial, Guía oral o marca de editorial en el texto = comercial; lo demás, apagado', () => {
  assert.equal(clasificarLibro({ id: 'phak-en', titulo: "Pilot's Handbook of Aeronautical Knowledge" }), 'publico');
  assert.equal(clasificarLibro({ id: 'x', titulo: 'Manual de la FAA' }), 'publico');
  assert.equal(clasificarLibro({ id: 'rad-es', titulo: 'Material de estudio' }), 'publico');
  assert.equal(clasificarLibro({ id: 'x', titulo: 'Reglamento Aeronáutico Dominicano' }), 'publico');
  assert.equal(clasificarLibro({ id: 'x', titulo: 'Cualquiera', licencia: 'dominio_publico' }), 'publico');
  assert.equal(clasificarLibro({ id: 'oral-en', titulo: 'Guía' }), 'comercial');
  assert.equal(clasificarLibro({ id: 'x', titulo: 'Guía del examen oral' }), 'comercial');
  assert.equal(clasificarLibro({ id: 'x', titulo: 'Jeppesen Private Pilot' }), 'comercial');
  assert.equal(clasificarLibro({ id: 'faa-x', titulo: 'FAA Handbook', licencia: 'comercial' }), 'comercial', 'la licencia del manifiesto manda');
  assert.equal(clasificarLibro({ id: 'faa-x', titulo: 'FAA Handbook' }, { textoComercial: true }), 'comercial', 'una marca de editorial en el texto gana');
  assert.equal(clasificarLibro({ id: 'pp-es', titulo: 'Manual de Piloto Privado (español)' }), 'dudoso');
  assert.equal(clasificarLibro({ id: 'fh-es', titulo: 'Manual de Factores Humanos (español)' }), 'dudoso');
});

test('páginas de un capítulo: por bytes (con tildes), el título de su primera página y la marca de editorial', () => {
  const texto = '=== p 7 ===\n[GFDPPM 1-1]\nCapítulo único\nÁngulo de ataque\n=== p 8 ===\nSegunda página ñandú.\n';
  const b = Buffer.from(texto);
  const ind = indiceDeCapitulo(b);
  assert.deepEqual(ind.paginas.map(p => p.pagina), [7, 8]);
  assert.equal(b.toString('utf8', ind.paginas[0].inicio, ind.paginas[0].fin), '[GFDPPM 1-1]\nCapítulo único\nÁngulo de ataque\n');
  assert.equal(b.toString('utf8', ind.paginas[1].inicio, ind.paginas[1].fin), 'Segunda página ñandú.\n');
  assert.equal(ind.titulo, 'Capítulo único · Ángulo de ataque');
  assert.equal(ind.comercial, true);
  assert.equal(indiceDeCapitulo(Buffer.from('=== p 1 ===\nSolo texto propio.\n')).comercial, false);
  assert.equal(normalizar('ALTÍMETRO  Ñu'), 'altimetro nu');
});

test('la vista: párrafos (renglones juntos, palabra partida unida), resaltar sin tildes y la página de una fuente', () => {
  assert.deepEqual(parrafos('Uno dos\ntres al-\ntura\n\n Otro párrafo \n'), ['Uno dos tres altura', 'Otro párrafo']);
  assert.deepEqual(resaltarBusqueda('El Altímetro mide', 'altimetro'), [{ texto: 'El ', marca: false }, { texto: 'Altímetro', marca: true }, { texto: ' mide', marca: false }]);
  assert.deepEqual(resaltarBusqueda('nada', ''), [{ texto: 'nada', marca: false }]);
  assert.equal(paginaDeFuente({ pagina: 'p. 12' }), 12);
  assert.equal(paginaDeFuente({ pagina: '—' }), null);
});

// ---------- La Biblioteca por la red ----------
test('Biblioteca: solo con sesión; el alumno ve FAA y RAD; índice, páginas con huecos, búsqueda e imágenes; sin caché', async () => {
  await conAcademia(async c => {
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca')).codigo, 401);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/paginas/1')).codigo, 401);
    const lista = await pedir(c.base, 'GET', '/api/academia/biblioteca', { galleta: c.ana });
    assert.equal(lista.codigo, 200);
    assert.equal(lista.cache, 'no-store');
    assert.deepEqual(lista.datos.libros.map(l => l.id), ['faa-muestra', 'rad-es']);
    assert.deepEqual(lista.datos.libros[0], { id: 'faa-muestra', titulo: "Pilot's Handbook de muestra (FAA)", paginas: 5, desde: 1, hasta: 11 });

    const ind = (await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra', { galleta: c.ana })).datos;
    assert.deepEqual(ind.capitulos, [{ n: 1, titulo: 'Capítulo 1 de muestra · Los instrumentos', desde: 1, hasta: 3 }, { n: 2, titulo: 'Capítulo 2 de muestra', desde: 10, hasta: 11 }]);
    assert.deepEqual(ind.temas, [{ titulo: 'Tema de muestra', materia: 'Factores humanos (muestra)', pagina: 2 }]);

    const p1 = await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/paginas/1', { galleta: c.ana });
    assert.equal(p1.cache, 'no-store');
    assert.equal(p1.datos.texto, 'Capítulo 1 de muestra\nLos instrumentos\n\nEl altímetro de muestra mide la al-\ntura con la presión.');
    assert.equal(p1.datos.anterior, null);
    assert.equal(p1.datos.siguiente, 2);
    assert.deepEqual(p1.datos.imagenes, [{ archivo: 'img-faa-muestra-p1-1.webp', pie: 'Un altímetro de muestra', ancho: 800, alto: 600 }]);
    const p3 = (await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/paginas/3', { galleta: c.ana })).datos;
    assert.equal(p3.siguiente, 10, 'después de la 3 viene la 10 (hueco 4–9)');
    const hueco = (await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/paginas/5', { galleta: c.ana })).datos;
    assert.equal(hueco.pagina, 10, 'una página que falta abre la siguiente que existe');
    assert.equal(hueco.anterior, 3);
    assert.equal(hueco.capitulo.n, 2);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/paginas/999', { galleta: c.ana })).datos.pagina, 11);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/paginas/abc', { galleta: c.ana })).codigo, 400);

    // Buscar: sin tildes ni mayúsculas, con su página; como mucho 3 por página; consulta corta → 400.
    const b = (await pedir(c.base, 'GET', `/api/academia/biblioteca/faa-muestra/buscar?q=${encodeURIComponent('altimetro')}`, { galleta: c.ana })).datos;
    assert.deepEqual(b.resultados.map(x => x.pagina), [1, 10, 10]);
    assert.equal(b.resultados[1].fragmento, 'El ALTIMETRO otra vez, en mayúsculas.');
    assert.equal(b.mas, false);
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/buscar?q=zzzz', { galleta: c.ana })).datos.resultados, []);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/buscar?q=al', { galleta: c.ana })).codigo, 400);

    // 0.14.43: leer por secciones (la ruta, con sesión y sin caché; un libro comercial no).
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/secciones/1')).codigo, 401);
    const s1 = await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/secciones/1', { galleta: c.ana });
    assert.equal(s1.codigo, 200);
    assert.equal(s1.cache, 'no-store');
    assert.equal(s1.datos.n, 1);
    assert.ok(s1.datos.total >= 1 && typeof s1.datos.texto === 'string');
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/secciones/0', { galleta: c.ana })).codigo, 400);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/pp-en/secciones/1', { galleta: c.ana })).codigo, 404);
    // Imágenes: solo por su nombre en imagenes.json y de un libro legible.
    const img = await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/imagenes/img-faa-muestra-p1-1.webp', { galleta: c.ana });
    assert.equal(img.codigo, 200);
    assert.equal(img.tipo, 'image/webp');
    assert.ok(img.datos.equals(WEBP));
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/faa-muestra/imagenes/img-otra.webp', { galleta: c.ana })).codigo, 404);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/biblioteca/faa-muestra/imagenes/${encodeURIComponent('../tg.json')}`, { galleta: c.ana })).codigo, 404);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/pp-en/imagenes/img-pp-en-p17-1.webp', { galleta: c.ana })).codigo, 404);
  });
});

test('Biblioteca: el libro comercial y la Guía oral no se abren ni forzando el ajuste; el administrador enciende uno sin confirmar', async () => {
  await conAcademia(async c => {
    const adm = (await pedir(c.base, 'GET', '/api/admin/academia/biblioteca', { galleta: c.admin, cabeceras: DUENO })).datos.libros;
    const de = id => adm.find(l => l.id === id);
    assert.deepEqual(adm.map(l => [l.id, l.clase, l.permitido, l.bloqueado]), [
      ['faa-muestra', 'publico', true, false], ['rad-es', 'publico', true, false], ['pp-en', 'comercial', false, true],
      ['misterio', 'dudoso', false, false], ['oral-en', 'comercial', false, true]]);
    assert.equal(de('pp-en').porDefecto, false);
    // Un alumno no toca el ajuste.
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/biblioteca', { galleta: c.ana })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/biblioteca/libros/misterio', { galleta: c.ana, datos: { permitido: true } })).codigo, 403);
    // Los comerciales: 400 libro_comercial desde la pantalla.
    for (const id of ['pp-en', 'oral-en']) {
      const r = await pedir(c.base, 'POST', `/api/admin/academia/biblioteca/libros/${id}`, { galleta: c.admin, cabeceras: DUENO, datos: { permitido: true } });
      assert.equal(r.codigo, 400);
      assert.equal(r.datos.error, 'libro_comercial');
    }
    // Forzado a mano en la base: igual cerrados (lo decide el servidor en cada pedido).
    guardarAjuste(c.db, AJUSTE_BIBLIOTECA, JSON.stringify({ 'pp-en': true, 'oral-en': true }));
    for (const ruta of ['/api/academia/biblioteca/pp-en', '/api/academia/biblioteca/pp-en/paginas/17', '/api/academia/biblioteca/pp-en/buscar?q=sample', '/api/academia/biblioteca/oral-en', '/api/academia/biblioteca/oral-en/paginas/3']) {
      const r = await pedir(c.base, 'GET', ruta, { galleta: c.ana });
      assert.equal(r.codigo, 404, ruta);
      assert.doesNotMatch(r.crudo, /sample/i, ruta);
    }
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/biblioteca', { galleta: c.ana })).datos.libros.map(l => l.id), ['faa-muestra', 'rad-es']);
    // Sin confirmar: apagado hasta que el administrador lo enciende; y se puede apagar uno de dominio público.
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/misterio/paginas/1', { galleta: c.ana })).codigo, 404);
    const on = await pedir(c.base, 'POST', '/api/admin/academia/biblioteca/libros/misterio', { galleta: c.admin, cabeceras: DUENO, datos: { permitido: true } });
    assert.equal(on.codigo, 200);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/biblioteca/misterio/paginas/1', { galleta: c.ana })).datos.texto, 'Un libro de muestra sin licencia conocida.');
    await pedir(c.base, 'POST', '/api/admin/academia/biblioteca/libros/rad-es', { galleta: c.admin, cabeceras: DUENO, datos: { permitido: false } });
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/biblioteca', { galleta: c.ana })).datos.libros.map(l => l.id), ['faa-muestra', 'misterio']);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/biblioteca/libros/rad-es', { galleta: c.admin, cabeceras: DUENO, datos: { permitido: 'si' } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/biblioteca/libros/no-esta', { galleta: c.admin, cabeceras: DUENO, datos: { permitido: true } })).codigo, 404);
  });
});

// ---------- «Ver en el Test Guide» ----------
test('Ver en el Test Guide: número, capítulo, referencia y el texto TAL CUAL; la respuesta solo después de responder y nunca en un examen abierto', async () => {
  await conAcademia(async c => {
    assert.equal((await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h1')).codigo, 401);
    const antes = await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h1', { galleta: c.ana });
    assert.equal(antes.codigo, 200);
    assert.equal(antes.cache, 'no-store');
    const d = antes.datos;
    assert.equal(d.numero, '5-12');
    assert.equal(d.capitulo, 5);
    assert.equal(d.referencia, 'Ref. de muestra 5-A');
    assert.equal(d.enunciado, TG_H1.enunciado, 'el del Test Guide, con sus espacios');
    assert.equal(d.deLasFuentes, true);
    assert.equal(d.difiere, true, 'la app lo muestra distinto: se avisa');
    assert.deepEqual(d.opciones, [{ letra: 'A', texto: 'Agua suficiente.' }, { letra: 'B', texto: 'Oxígeno suficiente.' }, { letra: 'C', texto: 'Azúcar suficiente.' }]);
    assert.equal(d.respuesta, null);
    assert.equal(d.bloqueo, 'sin_responder');
    assert.doesNotMatch(antes.crudo, /EXPLICACION-OFICIAL|"correcta"/);
    // Sin fuentes de esa pregunta: el original del paquete (que es copia del Test Guide).
    const h2 = (await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h2', { galleta: c.ana })).datos;
    assert.equal(h2.numero, 'M-02');
    assert.equal(h2.deLasFuentes, false);
    assert.equal(h2.difiere, false);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/test-guide/no-existe', { galleta: c.ana })).codigo, 404);

    // Responde en la práctica del tema: ahora sí, la respuesta oficial y su explicación.
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' } })).datos;
    await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: 'muestra-h1', elegida: 'A' } });
    const despues = (await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h1', { galleta: c.ana })).datos;
    assert.deepEqual(despues.respuesta, { correcta: 'B', texto: 'Oxígeno suficiente.', explicacion: TG_H1.explicacion });
    assert.equal(despues.bloqueo, null);

    // Un examen con reloj abierto que la trae: ni la respuesta ni la explicación, aunque ya la respondió antes.
    const ex = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'examen', materia: MATERIA, saltar: true } })).datos;
    assert.ok(ex.examen?.reloj);
    assert.ok(ex.preguntas.some(q => q.id === 'muestra-h1' && q.origen === 'test_guide'), 'la pregunta del examen lleva su origen (para el botón)');
    for (const id of ex.preguntas.map(q => q.id)) {
      const r = await pedir(c.base, 'GET', `/api/academia/test-guide/${id}`, { galleta: c.ana });
      assert.equal(r.codigo, 200, id);
      assert.equal(r.datos.respuesta, null, id);
      assert.equal(r.datos.bloqueo, 'en_examen', id);
      assert.ok(Array.isArray(r.datos.opciones) && r.datos.opciones.length >= 2, `${id}: el texto y las opciones sí (sin decir cuál)`);
      const q = MUESTRA.preguntas.find(x => x.id === id);
      assert.doesNotMatch(r.crudo, /"correcta"|EXPLICACION-OFICIAL/, id);
      assert.ok(!r.crudo.includes(q.original.explicacion), `${id}: sin la explicación`);
    }
    // Lo guardado en el examen no abre la respuesta; al entregar, sí.
    await pedir(c.base, 'POST', `/api/academia/intentos/${ex.id}/examen`, { galleta: c.ana, datos: { pregunta: 'muestra-h2', elegida: 'A' } });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h2', { galleta: c.ana })).datos.respuesta, null);
    await pedir(c.base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: c.ana, datos: {} });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h2', { galleta: c.ana })).datos.respuesta.correcta, 'A');
    // El administrador la ve siempre, salvo en un examen con reloj suyo abierto (cuando se prueba como alumno).
    assert.equal((await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h3', { galleta: c.admin, cabeceras: DUENO })).datos.respuesta.correcta, 'B');
    const exAdmin = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.admin, cabeceras: DUENO, datos: { tipo: 'examen', materia: MATERIA, saltar: true } })).datos;
    assert.ok(exAdmin.examen?.reloj);
    const enExamen = await pedir(c.base, 'GET', `/api/academia/test-guide/${exAdmin.preguntas[0].id}`, { galleta: c.admin, cabeceras: DUENO });
    assert.equal(enExamen.datos.respuesta, null);
    assert.equal(enExamen.datos.bloqueo, 'en_examen');
  });
});

test('Ver en el Test Guide en Modo reto: sin responder no se muestran las opciones oficiales (se adivinaría la correcta)', async () => {
  await conAcademia(async c => {
    guardarAjuste(c.db, 'academia.practica_modo', 'reto');
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.beto, datos: { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' } })).datos;
    assert.equal(i.modo, 'reto');
    const r = await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h1', { galleta: c.beto });
    assert.equal(r.datos.opciones, null);
    assert.equal(r.datos.opcionesOcultas, true);
    assert.equal(r.datos.respuesta, null);
    assert.ok(!r.crudo.includes('Oxígeno suficiente'), 'ni el texto de la correcta');
    await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.beto, datos: { pregunta: 'muestra-h1', elegida: i.preguntas.find(q => q.id === 'muestra-h1').opciones[0].letra } });
    const d = (await pedir(c.base, 'GET', '/api/academia/test-guide/muestra-h1', { galleta: c.beto })).datos;
    assert.equal(d.opcionesOcultas, false);
    assert.equal(d.respuesta.correcta, 'B');
  });
});

test('«Ver en el libro»: la fuente de una tarjeta trae el id del libro (la pantalla arma el enlace a la Biblioteca)', async () => {
  await conAcademia(async c => {
    const l = (await pedir(c.base, 'GET', `/api/academia/temas/${MATERIA}/muestra-hipoxia`, { galleta: c.ana })).datos;
    assert.equal(l.secciones[0].fuentes[0].libroId, 'muestra');
    assert.equal(H1.original.numero, '5-12');
  });
});
