// Academia 0.12.0: «¿De dónde salió?» (la página real del libro, solo después de responder), «Ir directo al examen»
// (saltar las clases, el orden guardado y «tú lo quisiste»), el humor del instructor (40 frases, sin repetir, con sus
// interruptores), lo EXTRA de una materia (aparte de todo lo del Test Guide) y el «Modo de práctica por defecto».
// Todo con el paquete de MUESTRA más contenido escrito aquí con palabras propias (nada de ningún libro).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { TIPOS_HUMOR, TOTAL_HUMOR, lineaHumor } from '../src/academia/humor.js';
import { armarConsejo } from '../src/academia/instructor-ia.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const T0 = Date.parse('2026-11-12T14:00:00Z');
const DIA = 86_400_000;
const PNG = figuraMuestraPng(200, 260);
const MATERIA = 'factores_humanos';

// La muestra + una página del libro (dibujada aquí) para dos preguntas + lo extra de la materia (escrito aquí).
function muestra012() {
  const p = paqueteMuestra();
  p.libros.push({ id: 'muestra-extra', titulo: 'Libro extra de muestra (inventado)', idioma: 'es' });
  p.paginas = [{ archivo: 'pagina-m1.png', libro: 'muestra', pagina: '7' }];
  for (const id of ['muestra-h1', 'muestra-h2']) p.preguntas.find(q => q.id === id).original.pagina_imagen = 'pagina-m1.png';
  const xq = (id, tema, nivel, correcta = 'A') => ({
    id, origen: 'extra', tema, nivel, enunciado: `Muestra extra ${id}: ¿cuál es la idea de este ejercicio inventado?`,
    opciones: [{ letra: 'A', texto: 'La primera idea inventada.' }, { letra: 'B', texto: 'La segunda idea inventada.' }, { letra: 'C', texto: 'La tercera idea inventada.' }],
    correcta, explicacion: 'Explicación inventada para la muestra.',
    porque_incorrectas: Object.fromEntries(['A', 'B', 'C'].filter(l => l !== correcta).map(l => [l, `La ${l} no, en esta muestra.`])),
    fuente: { libro: 'muestra-extra', pagina: 'p. 3', cita_corta: 'una cita corta inventada', verificado_en: 'texto' },
  });
  p.materias[0].extra = {
    tarjetas: [{ tipo: 'tarjeta', subtipo: 'profundiza', origen: 'extra', tema: 'muestra-hipoxia', titulo: 'Profundiza (muestra)', puntos: ['Un punto inventado.'], recuerda: 'Algo para recordar.', fuentes: [{ libro: 'muestra-extra', pagina: 'p. 3' }] }],
    preguntas: [xq('x-m-01', 'muestra-hipoxia', 'basico'), xq('x-m-02', 'muestra-hipoxia', 'intermedio', 'B'), xq('x-m-03', 'muestra-ilusiones', 'avanzado', 'C')],
  };
  return p;
}
const MUESTRA = muestra012();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const tipo = r.headers.get('content-type') ?? '';
  const contenido = tipo.includes('json') ? await r.json().catch(() => ({})) : Buffer.from(await r.arrayBuffer());
  return { codigo: r.status, datos: contenido, tipo, galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function conAcademia(fn, { paquete = MUESTRA, conPagina = true } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    const ids = {};
    const alumnos = {};
    for (const nombre of ['ana', 'beto']) {
      ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paquete) });
    assert.equal(s.codigo, 201, JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    const paginas = s.datos.faltanPaginas ?? [];
    if (conPagina) for (const archivo of paginas) {
      const x = await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/paginas/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: PNG });
      assert.equal(x.codigo, 201, JSON.stringify(x.datos));
    }
    const act = await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} });
    assert.equal(act.codigo, 200, 'las páginas no impiden que la versión quede lista');
    await fn({ base, db, config, reloj, admin, ids, paginas, paqueteId: s.datos.paquete.id, ...alumnos });
  });
  db.close();
}
const nuevo = (c, galleta, datos) => pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos });
async function hacerIntento(c, galleta, datos, eleccion = id => DE(id).original.correcta) {
  const i = (await nuevo(c, galleta, datos)).datos;
  const ruta = i.examen?.reloj ? 'examen' : 'responder';
  for (const q of i.preguntas) { c.reloj.avanzar(20_000); await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/${ruta}`, { galleta, datos: { pregunta: q.id, elegida: eleccion(q.id) } }); }
  return (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos;
}

// ---------- El formato del paquete ----------
test('formato: «paginas», «original.pagina_imagen» y «extra» bien armados pasan; cada error sale con su ruta', () => {
  const r = revisarPaquete(MUESTRA);
  assert.ok(r.ok, JSON.stringify(r.errores));
  assert.deepEqual(r.paginas.map(g => g.archivo), ['pagina-m1.png']);
  assert.deepEqual(r.resumen.extra, { preguntas: 3, tarjetas: 1 });
  const con = cambio => { const p = structuredClone(MUESTRA); cambio(p); return revisarPaquete(p).errores.map(e => `${e.ruta}: ${e.motivo}`); };
  assert.ok(con(p => { p.preguntas[0].original.pagina_imagen = 'no-esta.png'; }).includes('preguntas[0].original.pagina_imagen: pagina_desconocida'));
  assert.ok(con(p => { p.paginas[0].libro = 'otro'; }).includes('paginas[0].libro: libro_desconocido'));
  assert.ok(con(p => { p.paginas[0].archivo = 'pagina.pdf'; }).includes('paginas[0].archivo: archivo_no_valido'));
  const x = 'materias[0].extra.preguntas[0]';
  assert.ok(con(p => { p.materias[0].extra.preguntas[0].origen = 'test_guide'; }).includes(`${x}.origen: origen_no_valido`));
  assert.ok(con(p => { p.materias[0].extra.preguntas[0].tema = 't99'; }).includes(`${x}.tema: tema_desconocido`));
  assert.ok(con(p => { p.materias[0].extra.preguntas[0].nivel = 'experto'; }).includes(`${x}.nivel: nivel_no_valido`));
  assert.ok(con(p => { delete p.materias[0].extra.preguntas[0].porque_incorrectas.B; }).includes(`${x}.porque_incorrectas.B: falta`));
  assert.ok(con(p => { p.materias[0].extra.preguntas[0].porque_incorrectas.A = 'la correcta'; }).includes(`${x}.porque_incorrectas.A: no_es_opcion_incorrecta`));
  assert.ok(con(p => { p.materias[0].extra.preguntas[0].fuente.cita_corta = Array(30).fill('palabra').join(' '); }).includes(`${x}.fuente.cita_corta: cita_muy_larga`));
  assert.ok(con(p => { p.materias[0].extra.preguntas[0].fuente.libro = 'no-esta'; }).includes(`${x}.fuente.libro: libro_desconocido`));
  assert.ok(con(p => { p.materias[0].extra.preguntas[1].id = 'muestra-h1'; }).includes('materias[0].extra.preguntas[1].id: repetido'), 'un id extra no puede ser el de una pregunta del Test Guide');
  assert.ok(con(p => { p.materias[0].extra.tarjetas[0].origen = 'x'; }).includes('materias[0].extra.tarjetas[0].origen: origen_no_valido'));
  // Un paquete sin nada de esto sigue igual que antes.
  assert.ok(revisarPaquete(paqueteMuestra()).ok);
});

// ---------- 1. «¿De dónde salió?» ----------
test('¿De dónde salió?: la referencia viaja siempre; la imagen de la página solo después de responder y nunca en un examen con reloj abierto', async () => {
  await conAcademia(async c => {
    assert.deepEqual(c.paginas, ['pagina-m1.png']);
    const i = (await nuevo(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' })).datos;
    const q = i.preguntas.find(x => x.id === 'muestra-h1');
    assert.deepEqual(q.paginaLibro, { libro: 'Libro de muestra (inventado para las pruebas)', pagina: '7', imagen: true });
    assert.equal(q.numero, 'M-01');
    assert.equal(i.preguntas.find(x => x.id === 'muestra-h3').paginaLibro, null, 'sin página en el paquete: solo la referencia en texto');
    // Antes de responder: 403 (en la página está la respuesta).
    assert.equal((await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h1', { galleta: c.ana })).codigo, 403);
    await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: 'muestra-h1', elegida: 'B' } });
    const img = await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h1', { galleta: c.ana });
    assert.equal(img.codigo, 200);
    assert.equal(img.tipo, 'image/png');
    assert.ok(img.datos.equals(PNG));
    // Otro alumno que no la respondió: 403. El administrador: siempre.
    assert.equal((await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h1', { galleta: c.beto })).codigo, 403);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h2', { galleta: c.admin, cabeceras: DUENO })).codigo, 200);
    // Sin sesión: nada.
    assert.notEqual((await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h1', {})).codigo, 200);
    // Con un examen con reloj abierto que trae esa pregunta: 403 aunque ya la haya respondido antes.
    const ex = (await nuevo(c, c.ana, { tipo: 'examen', materia: MATERIA, saltar: true })).datos;
    assert.ok(ex.examen?.reloj);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h1', { galleta: c.ana })).codigo, 403);
    await pedir(c.base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: c.ana, datos: {} });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/paginas/muestra-h1', { galleta: c.ana })).codigo, 200);
  });
});

test('¿De dónde salió?: si la imagen de la página no llegó, la versión igual queda lista y se ve solo la referencia', async () => {
  await conAcademia(async c => {
    const i = (await nuevo(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' })).datos;
    assert.equal(i.preguntas.find(x => x.id === 'muestra-h1').paginaLibro.imagen, false);
    const lista = (await pedir(c.base, 'GET', '/api/admin/academia', { galleta: c.admin, cabeceras: DUENO })).datos.paquetes[0];
    assert.deepEqual(lista.faltanPaginas, ['pagina-m1.png']);
  }, { conPagina: false });
});

// ---------- 2. Ir directo al examen ----------
test('saltar etapas: sin «saltar» sigue 403; con «saltar» se guarda el orden y el salto; si se quema, «tú lo quisiste» y a las etapas', async () => {
  await conAcademia(async c => {
    assert.equal((await nuevo(c, c.ana, { tipo: 'examen', materia: MATERIA })).codigo, 403, 'el examen cerrado sigue cerrado sin pedirlo');
    let camino = (await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos;
    const m = camino.materias.find(x => x.id === MATERIA);
    assert.equal(m.examen.saltable, true);
    assert.equal(m.examen.pendientes, 2);
    assert.equal(m.orden, null);
    const res = await hacerIntento(c, c.ana, { tipo: 'examen', materia: MATERIA, saltar: true }, id => mala(id));
    assert.equal(res.aprobado, false);
    assert.deepEqual(res.salto, { saltados: 2, total: 2, pendientes: 2, siguiente: { tema: 'muestra-hipoxia', titulo: 'La hipoxia (muestra)' } });
    assert.match(res.humor.clave, /^humor\.salto\.\d+$/, 'se quemó después de saltar: frase del tipo «salto»');
    // Volver a mirar el resultado: la misma frase.
    const otra = (await pedir(c.base, 'POST', `/api/academia/intentos/${res.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    assert.equal(otra.humor.clave, res.humor.clave);
    camino = (await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos;
    assert.equal(camino.materias.find(x => x.id === MATERIA).orden, 'examen_antes');
    assert.equal(camino.materias.find(x => x.id === MATERIA).temas[1].estado, 'bloqueado', 'saltar no abre ningún tema');
    // El instructor se lo recuerda y lo manda a la etapa que toca.
    const consejo = (await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos.consejo;
    assert.equal(consejo.clave, 'salto_quemado');
    assert.deepEqual([consejo.vars.n, consejo.vars.pct], [2, 0]);
    assert.deepEqual(consejo.accion, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' });
    // La preparación lo sabe.
    const v = (await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos;
    const clases = v.reglas.find(r => r.id === 'clases');
    assert.deepEqual([clases.ok, clases.valor], [false, 2]);
    // La ficha del administrador: «saltó las clases».
    const ficha = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/ficha`, { galleta: c.admin, cabeceras: DUENO })).datos;
    assert.equal(ficha.saltos.orden[MATERIA], 'examen_antes');
    assert.equal(ficha.saltos.eventos.length, 1);
    assert.deepEqual([ficha.saltos.eventos[0].pendientes, ficha.saltos.eventos[0].pct, ficha.saltos.eventos[0].aprobado], [2, 0, false]);
    // Beto hace los temas primero: «temas_antes».
    await hacerIntento(c, c.beto, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' });
    await hacerIntento(c, c.beto, { tipo: 'tema', materia: MATERIA, tema: 'muestra-ilusiones' });
    await hacerIntento(c, c.beto, { tipo: 'examen', materia: MATERIA });
    camino = (await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.beto })).datos;
    assert.equal(camino.materias.find(x => x.id === MATERIA).orden, 'temas_antes');
    assert.equal((await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.beto })).datos.reglas.find(r => r.id === 'clases').ok, true);
  });
});

test('saltar etapas: si pasa después de saltar, igual le recomienda hacer los temas (y la regla «clases» no se cumple hasta hacerlos)', async () => {
  await conAcademia(async c => {
    const res = await hacerIntento(c, c.ana, { tipo: 'examen', materia: MATERIA, saltar: true });
    assert.equal(res.aprobado, true);
    assert.equal(res.salto.pendientes, 2);
    assert.equal(res.humor, undefined, 'sin quemarse no hay vacilón');
    const consejo = (await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos.consejo;
    assert.equal(consejo.clave, 'salto_paso');
    assert.equal((await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos.reglas.find(r => r.id === 'clases').ok, false);
    await hacerIntento(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' });
    await hacerIntento(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-ilusiones' });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos.reglas.find(r => r.id === 'clases').ok, true);
    assert.notEqual((await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos.consejo.clave, 'salto_paso');
  });
});

// ---------- 3. El humor ----------
const ES = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'));
const EN = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'en.json'), 'utf8'));
// Lo que nunca puede salir (insultos, malas palabras fuertes, raza, religión, sexo, cuerpo, familia).
const PROHIBIDO = /\b(co[ñn]o|carajo|mierda|puta|puto|pendej|maric|cabr[oó]n|est[uú]pid|idiota|imb[eé]cil|bruto|burro|tonto|gordo|flaco|feo|negro|prieto|chino|indio|dios|virgen|iglesia|sexo|tu madre|tu mam[aá]|tu pap[aá]|tu familia|fuck|shit|damn|bitch|stupid|idiot|dumb|fat|ugly|god|church|sex|your mom|your mother|your family)\b/i;
test('humor: 40 frases en cada idioma, todas distintas, cortas y sin nada ofensivo', () => {
  assert.equal(TOTAL_HUMOR, 40);
  for (const dic of [ES, EN]) {
    const frases = Object.entries(TIPOS_HUMOR).flatMap(([tipo, n]) => Array.from({ length: n }, (_, i) => dic[`humor.${tipo}.${i + 1}`]));
    assert.ok(frases.every(f => typeof f === 'string' && f.length >= 10 && f.length <= 170), 'cada frase existe y es corta');
    assert.equal(new Set(frases).size, 40, 'sin repetidas');
    for (const f of frases) assert.doesNotMatch(f, PROHIBIDO, f);
  }
  for (const k of ['acad.saltar.aviso', 'acad.saltar.boton', 'salto.quemado', 'salto.paso', 'extra.sello', 'instr.c.salto_quemado', 'instr.c.salto_paso', 'origen.boton', 'listo.regla.clases']) {
    assert.ok(k in ES && k in EN, `falta ${k}`);
  }
  assert.equal(ES['acad.saltar.aviso'], 'Si saltas las clases y te quemas, el instructor te lo va a recordar.');
});

test('humor: sin repetir hasta que salen todas; el administrador lo apaga para todos y cada alumno para sí', async () => {
  await conAcademia(async c => {
    const id = c.ids.ana;
    const vistas = [];
    for (let k = 0; k < TIPOS_HUMOR.quemado; k++) vistas.push(lineaHumor(c.db, id, 'quemado').clave);
    assert.equal(new Set(vistas).size, TIPOS_HUMOR.quemado, 'las 12 salen antes de repetir');
    assert.notEqual(lineaHumor(c.db, id, 'quemado').clave, vistas.at(-1), 'nunca la misma dos veces seguidas');
    // El alumno lo apaga (Configuración).
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/humor', { galleta: c.ana })).datos, { permitido: true, encendido: true });
    assert.equal((await pedir(c.base, 'POST', '/api/academia/humor', { galleta: c.ana, datos: { encendido: false } })).datos.encendido, false);
    assert.equal(lineaHumor(c.db, id, 'quemado'), null);
    const res = await hacerIntento(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' }, q => mala(q));
    assert.equal(res.aprobado, false);
    assert.equal(res.humor, undefined);
    // Beto sí lo tiene… hasta que el administrador lo apaga para todos. 0.12.2: la primera vez que no aprueba (y la
    // segunda) no hay «te quemaste», solo ánimo; el humor llega cuando ya no aprobó lo mismo 2 veces antes.
    for (let k = 0; k < 2; k++) {
      const b = await hacerIntento(c, c.beto, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' }, q => mala(q));
      assert.deepEqual([b.aprobado, b.humor, b.animo], [false, undefined, true], `vez ${k + 1}: sin humor, con ánimo`);
    }
    assert.match((await hacerIntento(c, c.beto, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' }, q => mala(q))).humor.clave, /^humor\.quemado\.\d+$/);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/humor', { galleta: c.admin, cabeceras: DUENO, datos: { encendido: false } })).datos.humor, false);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/humor', { galleta: c.beto, datos: { encendido: true } })).codigo, 403);
    assert.equal((await hacerIntento(c, c.beto, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' }, q => mala(q))).humor, undefined);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/humor', { galleta: c.beto })).datos.permitido, false);
  });
});

test('humor: la racha perdida y el regreso (una frase por día); y la IA recibe las reglas del tono solo si está encendido', async () => {
  await conAcademia(async c => {
    await hacerIntento(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' });
    c.reloj.avanzar(DIA);
    await hacerIntento(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-ilusiones' });
    c.reloj.avanzar(3 * DIA);
    const h = (await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos.humor;
    assert.equal(h.tipo, 'racha');
    assert.equal((await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos.humor.clave, h.clave, 'la misma todo el día');
    await hacerIntento(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-ilusiones' });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos.humor.tipo, 'regreso');
  });
  assert.match(armarConsejo({ cifras: {}, humor: true }).sistema, /Nunca te burles de la raza, la religión, el sexo, el cuerpo ni la familia/);
  assert.doesNotMatch(armarConsejo({ cifras: {} }).sistema, /vacilón/);
});

// ---------- 4. Lo EXTRA ----------
test('extra: se estudia aparte (tarjetas y rondas por nivel), la respuesta no viaja antes, y no cuenta para nada del Test Guide', async () => {
  await conAcademia(async c => {
    const camino = (await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos;
    assert.deepEqual(camino.materias.find(x => x.id === MATERIA).extra, { preguntas: 3, tarjetas: 1, recomendado: false });
    const x = (await pedir(c.base, 'GET', `/api/academia/extra/${MATERIA}`, { galleta: c.ana })).datos;
    assert.equal(x.hay, true);
    assert.equal(x.recomendado, false, 'siempre visible, recomendado después del examen');
    assert.deepEqual(x.niveles.map(n => [n.nivel, n.preguntas]), [['basico', 1], ['intermedio', 1], ['avanzado', 1]]);
    assert.equal(x.temas[0].tarjetas[0].fuentes[0].libro, 'Libro extra de muestra (inventado)');
    // 0.12.12: la lección dice cuántas tarjetas para profundizar trae su tema («Profundizar en este tema»; 0 = no se ofrece).
    const temaConExtra = x.temas.find(tm => tm.tarjetas.length).id;
    const leccion = await pedir(c.base, 'GET', `/api/academia/temas/${MATERIA}/${temaConExtra}`, { galleta: c.ana });
    assert.equal(leccion.codigo, 200);
    assert.equal(leccion.datos.extra, 1);
    const ronda = (await pedir(c.base, 'POST', `/api/academia/extra/${MATERIA}/ronda`, { galleta: c.ana, datos: { nivel: 'intermedio' } })).datos;
    assert.deepEqual(ronda.preguntas.map(q => q.id), ['x-m-02']);
    assert.ok(!JSON.stringify(ronda).includes('"correcta"') && !JSON.stringify(ronda).includes('porque'), 'la correcta no viaja antes');
    const antes = { puntos: camino.puntos, respuestas: c.db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas').get().n };
    const preparadoAntes = (await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos;
    const r = (await pedir(c.base, 'POST', `/api/academia/extra/${MATERIA}/responder`, { galleta: c.ana, datos: { pregunta: 'x-m-02', elegida: 'A' } })).datos;
    assert.deepEqual([r.acierto, r.correcta, r.porque], [false, 'B', 'La A no, en esta muestra.']);
    assert.deepEqual(r.fuente, { libro: 'Libro extra de muestra (inventado)', pagina: 'p. 3', cita: 'una cita corta inventada' });
    await pedir(c.base, 'POST', `/api/academia/extra/${MATERIA}/responder`, { galleta: c.ana, datos: { pregunta: 'x-m-01', elegida: 'A' } });
    assert.equal((await pedir(c.base, 'POST', `/api/academia/extra/${MATERIA}/responder`, { galleta: c.ana, datos: { pregunta: 'x-m-01', elegida: 'Z' } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', `/api/academia/extra/${MATERIA}/responder`, { galleta: c.ana, datos: { pregunta: 'muestra-h1', elegida: 'B' } })).codigo, 404, 'una del Test Guide no entra por aquí');
    // Nada del Test Guide se movió: puntos, respuestas, preparación.
    const despues = (await pedir(c.base, 'GET', '/api/academia/camino', { galleta: c.ana })).datos;
    assert.equal(despues.puntos, antes.puntos);
    assert.equal(despues.racha, camino.racha);
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas').get().n, antes.respuestas);
    const preparadoDespues = (await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos;
    assert.deepEqual(preparadoDespues.reglas, preparadoAntes.reglas);
    // Aparte en Progreso y en la ficha.
    const prog = (await pedir(c.base, 'GET', '/api/academia/progreso', { galleta: c.ana })).datos;
    assert.deepEqual([prog.extra[0].materia, prog.extra[0].respuestas, prog.extra[0].aciertos, prog.extra[0].bien], [MATERIA, 2, 1, 1]);
    assert.ok(prog.materias.every(m => m.respuestas === 0), 'el % del Test Guide no cuenta lo extra');
    const ficha = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/ficha`, { galleta: c.admin, cabeceras: DUENO })).datos;
    assert.equal(ficha.extra[0].respuestas, 2);
    assert.equal(ficha.resumen.respuestas, 0);
    // Beto no ve lo de Ana.
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/progreso', { galleta: c.beto })).datos.extra, []);
  });
});

// ---------- 5. Modo de práctica por defecto ----------
test('práctica por defecto: Original salvo que el administrador ponga Reto; solo los temas (los exámenes siempre Original)', async () => {
  await conAcademia(async c => {
    let i = (await nuevo(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' })).datos;
    assert.equal(i.modo, 'original');
    const aj = await pedir(c.base, 'POST', '/api/admin/academia/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { practicaModo: 'reto' } });
    assert.equal(aj.datos.ajustes.practicaModo, 'reto');
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { practicaModo: 'otro' } })).codigo, 400);
    i = (await nuevo(c, c.ana, { tipo: 'tema', materia: MATERIA, tema: 'muestra-hipoxia' })).datos;
    assert.equal(i.modo, 'reto');
    assert.ok(i.preguntas.some(q => q.modo === 'reto'), 'las que traen reto salen en Modo reto');
    assert.ok(i.preguntas.some(q => q.modo == null), 'la que no trae reto sale en Original');
    // Responder bien todas (la correcta en reto viene con otra letra) aprueba el tema.
    for (const q of i.preguntas) {
      let letra = DE(q.id).original.correcta;
      if (q.modo === 'reto') letra = q.opciones.find(o => o.texto === DE(q.id).original.opciones.find(x => x.letra === DE(q.id).original.correcta).texto).letra;
      const r = await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: letra } });
      assert.equal(r.datos.respuesta.acierto, true, q.id);
    }
    assert.equal((await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos.aprobado, true);
    // Cambiar el ajuste después no cambia un intento ya creado; el examen va en Original.
    const ex = (await nuevo(c, c.ana, { tipo: 'examen', materia: MATERIA, saltar: true })).datos;
    assert.equal(ex.modo, 'original');
    assert.ok(ex.preguntas.every(q => q.modo == null));
  });
});
