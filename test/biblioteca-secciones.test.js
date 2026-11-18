// Academia 0.14.43: la Biblioteca por SECCIONES (el texto del RAD organizado: índice por sección, cada sección con sus
// títulos, párrafos y listas, buscar que devuelve secciones) y los libros de dominio público que agrega el «extra»
// (los manuales de la FAA). Texto SINTÉTICO parecido al del RAD (nunca el material real), en una carpeta temporal.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDePrueba } from './ayuda.js';
import { abrirBase } from '../src/nucleo/db.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { carpetaFuentes, unirExtra, leerManifiesto, librosDelExtra, DEL_EXTRA } from '../src/academia/fuentes.js';
import { seccionesDeCapitulo, nivelDeTitulo, seccionEn } from '../src/academia/biblioteca-secciones.js';
import { indiceDeLibro, seccionDeLibro, paginaDeLibro, buscarEnLibro, listaBiblioteca, librosParaAdmin, cambiarLibro, clasificarLibro, AJUSTE_BIBLIOTECA } from '../src/academia/biblioteca.js';
import { estructura, filasDelIndice, nombreSeccion } from '../public/biblioteca-vista.js';
import { paginasDePdftotext, repartirCapitulos, capituloDePagina, limpiarPagina, resumen } from '../scripts/libros-faa.mjs';

// Los renglones de muestra imitan los del PDF: largos (≈ 95 letras) salvo el último del párrafo.
const RAD = [
  '=== p 1 ===',
  'Motivación: Como piloto privado de muestra se debe tener conocimiento de la ley de aviación y del',
  'reglamento de muestra en sus partes 1, 2, 61 y 91, por eso se preparó este material de prueba.',
  'Historia: El primer vuelo comercial de muestra se realizó entre dos ciudades inventadas en 1913 y',
  'la primera regulación surgió en la convención de muestra.',
  'Este convenio consta de las siguientes partes:',
  'Parte I – Vuelo de muestra.',
  'Parte II – Se crea la organización de muestra.',
  'Anexo 1 - Personal de muestra.',
  'Anexo 2 - Reglas de prueba.',
  'Marco Legal',
  'A raíz del convenio de muestra',
  'de 1944 se creó la ley de prueba.',
  'Esquema de la jerarquía de muestra',
  '',
  'Articulo 10.- Todo piloto al mando de una aeronave de muestra deberá conocer esta ley de prueba y',
  'los reglamentos que rigen la navegación aérea.',
  '=== p 2 ===',
  'Prohibiciones',
  'Artículo 152.- Además de las prohibiciones de muestra, será considerado ilegal lo siguiente en la',
  'aeronave de prueba:',
  'h) transportar armas de muestra sin la debida autorización.',
  'i) volar de muestra por debajo de la altitud mínima establecida para la zona de prueba sin la autorización',
  'previa y escrita del director de muestra.',
  'RAD 3 - TÉRMINOS Y SIGLAS DE MUESTRA',
  'Aeródromo: Un área definida de tierra o agua de muestra, que comprende todas las instalaciones de',
  'prueba destinadas a la llegada y salida de aeronaves.',
  'Noche: El período de muestra entre el fin de la tarde civil de prueba y el comienzo de la',
  'matutino, en la muestra.',
  'RAD 5 – REGLAS DE MUESTRA DEL AIRE',
  '5.9 Preparación de muestra antes del vuelo.',
  'a) Antes de iniciar un vuelo de muestra, el piloto al mando se familiarizará con toda la información',
  'disponible apropiada al vuelo proyectado de prueba.',
  'RAD 47 – TALLERES, INSPECCIONES DE MUESTRA, REVISIONES Y',
  'PRUEBAS',
  '47.3 Personas Habilitadas Para Firmar Talleres, Inspecciones de Muestra,',
  'Revisiones y Pruebas.',
  'b) El titular de una licencia de técnico de muestra puede realizar mantenimiento preventivo de la',
  'aeronave de prueba según el RAD 47.',
  'RAD 63 – PERMISOS Y CONSTANCIAS DE MUESTRA',
  '63.19 Duración de los permisos de muestra del piloto',
  'a) El titular de una licencia de muestra con fecha de vencimiento no puede ejercer sus privilegios',
  'y el permiso de muestra del piloto se mantiene mientras su constancia de prueba siga en orden',
  '63.23 Constancias de salud: condiciones y duración de muestra.',
  'Una persona de muestra debe poseer un certificado médico de primera clase para las operaciones de',
  'la muestra que lo requieren.',
  '=== p 3 ===',
  '63.57 Práctica reciente de muestra: piloto al mando',
  'Ninguna persona de muestra debe actuar como piloto al mando de una aeronave llevando pasajeros, si',
  'no ha hecho al menos tres despegues y tres aterrizajes dentro de los 90 días precedentes de la',
  'muestra con parada completa.',
  'Práctica de muestra en horario nocturno.',
  'Ningún piloto al mando de muestra podrá llevar pasajeros durante el período nocturno de prueba a',
  'menos que haya hecho tres despegues y tres aterrizajes nocturnos.',
  '',
  'Certificado',
  'Médico',
  '',
  'RAD 95 – REGLAS DE OPERACION DE MUESTRA',
  'Sección B ― Reglas de Prueba',
  '95.104 Condiciones de muestra para volar sobre el agua',
  'Ninguna persona de muestra puede operar una aeronave monomotor sobre el agua más allá de la distancia',
  'de planeo de prueba.',
  '95.407',
  'Operaciones',
  'después',
  'de',
  'taller.',
  'Ninguna persona puede operar una aeronave de muestra que ha estado sometida a mantenimiento a menos',
  'que haya sido aprobada para ser retornada al servicio según el',
  'RAD 47.',
  '=== p 4 ===',
  'Cuando la conformidad de mantenimiento de muestra no la haya expedido un taller aprobado, la persona',
  'que firme deberá ser titular de una licencia de prueba.',
  '',
].join('\n');

test('las secciones del RAD: títulos reales (RAD N, numerados, Sección, Mayúsculas Iniciales), juntados y por bytes', () => {
  const buffer = Buffer.from(RAD);
  const secs = seccionesDeCapitulo(buffer);
  assert.deepEqual(secs.map(s => s.titulo), [
    null, 'Marco Legal', 'Prohibiciones', 'RAD 3 - TÉRMINOS Y SIGLAS DE MUESTRA', '5.9 Preparación de muestra antes del vuelo',
    '47.3 Personas Habilitadas Para Firmar Talleres, Inspecciones de Muestra, Revisiones y Pruebas',
    '63.19 Duración de los permisos de muestra del piloto',
    '63.23 Constancias de salud: condiciones y duración de muestra',
    '63.57 Práctica reciente de muestra: piloto al mando',
    '95.104 Condiciones de muestra para volar sobre el agua',
    '95.407 Operaciones después de taller',
  ]);
  // Los títulos sin texto propio son el encabezado de la sección que sigue (RAD 47 se juntó en un renglón).
  assert.deepEqual(secs[4].encabezados, [{ titulo: 'RAD 5 – REGLAS DE MUESTRA DEL AIRE', nivel: 1 }]);
  assert.deepEqual(secs[5].encabezados, [{ titulo: 'RAD 47 – TALLERES, INSPECCIONES DE MUESTRA, REVISIONES Y PRUEBAS', nivel: 1 }]);
  assert.deepEqual(secs[9].encabezados.map(e => e.titulo), ['RAD 95 – REGLAS DE OPERACION DE MUESTRA', 'Sección B ― Reglas de Prueba']);
  assert.deepEqual(secs.map(s => s.nivel), [1, 2, 2, 1, 3, 3, 3, 3, 3, 3, 3]);
  // Páginas: la sección que cruza una página dice las dos; la del final, de la 3 a la 4.
  assert.deepEqual([secs[0].desde, secs[0].hasta, secs.at(-1).desde, secs.at(-1).hasta], [1, 1, 3, 4]);
  // El texto de una sección: sin su título, con la marca de página adentro.
  const ultima = buffer.toString('utf8', secs.at(-1).inicio, secs.at(-1).fin);
  assert.match(ultima, /^Ninguna persona puede operar/);
  assert.match(ultima, /=== p 4 ===/);
  assert.doesNotMatch(buffer.toString('utf8', secs[8].inicio, secs[8].fin), /RAD 95/);
  // Lo que NO es título: el pie de una figura, una lista «Parte I – …», «RAD 47.» del texto, una tabla de una palabra.
  assert.equal(nivelDeTitulo('Esquema de la jerarquía de muestra', 'de 1944 se creó la ley de prueba.', ''), 0);
  assert.equal(nivelDeTitulo('RAD 47.', 'que haya sido aprobada para ser retornada al servicio según el', 'Cuando…'), 0);
  assert.equal(nivelDeTitulo('RAD u otros procedimientos locales hasta el punto requerido.', 'x.', 'y'), 0);
  assert.equal(nivelDeTitulo('Certificado', '', 'Médico', 'muestra con parada completa.'), 0);
  assert.equal(nivelDeTitulo('Términos y Siglas', '', 'Reglas del Aire', '142'), 0);
  assert.equal(nivelDeTitulo('Chapter 3', '', 'Basic Flight Maneuvers'), 1);
  assert.equal(nivelDeTitulo('Forces Acting on the Aircraft', 'The end of a paragraph.', 'Thrust is the forward force produced by the powerplant and propeller.'), 2);
  // Una sección por byte: el comienzo de un renglón cae en la sección que lo contiene.
  const conArchivo = secs.map((s, i) => ({ ...s, archivo: 'a', n: i + 1 }));
  assert.equal(seccionEn(conArchivo, 'a', buffer.indexOf('tres despegues')).n, 9);
  assert.equal(seccionEn(conArchivo, 'a', buffer.indexOf('Motivación')).n, 1);
});

test('un PDF con cabecera repetida y etiquetas de figura: no son secciones (las etiquetas quedan en la sección de antes)', () => {
  const largo = 'Sample body text of the handbook that is long enough to look like a real paragraph in a PDF page.';
  const texto = [
    '=== p 1 ===', 'AIRPLANE SYSTEMS', 'Chapter 2', 'The Airplane', largo, largo, largo, '',
    '=== p 2 ===', 'AIRPLANE SYSTEMS', largo + '.', 'FLOAT CHAMBER', 'Fuel level is kept by a float-type device of the sample.', '',
    '=== p 3 ===', 'AIRPLANE SYSTEMS', '', 'Forces Acting on the Airplane', largo, largo, largo, '',
  ].join('\n');
  const secs = seccionesDeCapitulo(Buffer.from(texto));
  assert.deepEqual(secs.map(x => x.titulo), ['Chapter 2 · The Airplane', 'Forces Acting on the Airplane']);
  assert.match(Buffer.from(texto).toString('utf8', secs[0].inicio, secs[0].fin), /FLOAT CHAMBER/);
});

test('una sección muy larga se parte en las páginas (la segunda parte lleva el mismo título y «continuación»)', () => {
  const renglon = 'Texto de muestra largo para llenar la sección con renglones parecidos a los de un PDF real aquí.';
  const pagina = n => [`=== p ${n} ===`, ...Array.from({ length: 120 }, () => renglon)].join('\n');
  const texto = ['=== p 1 ===', '95.155 Mínimos de muestra', ...Array.from({ length: 120 }, () => renglon), pagina(2), pagina(3), pagina(4)].join('\n');
  const secs = seccionesDeCapitulo(Buffer.from(texto));
  assert.ok(secs.length >= 2, String(secs.length));
  assert.ok(secs.every(s => s.titulo === '95.155 Mínimos de muestra'));
  assert.deepEqual(secs.map(s => s.parte ?? 1), secs.map((_, i) => i + 1));
  assert.ok(secs.every(s => s.fin - s.inicio <= 64 * 1024));
  assert.equal(nombreSeccion({ titulo: 'A', parte: 2 }, (k, v) => `${k}:${v?.titulo ?? ''}:${v?.n ?? ''}`), 'biblio.seccion.continua:A:2');
});

test('la vista de una sección: definiciones en negrita, «Anexo N -» como lista, subtítulos, artículos y la página', () => {
  const ini = seccionesDeCapitulo(Buffer.from(RAD))[0];
  const texto = Buffer.from(RAD).toString('utf8', ini.inicio, ini.fin);
  const b = estructura(texto);
  assert.deepEqual(b.slice(0, 2).map(x => [x.etiqueta, x.definicion]), [['Motivación', true], ['Historia', true]]);
  assert.equal(b[2].texto, 'Este convenio consta de las siguientes partes:');
  assert.deepEqual(b[3], { tipo: 'lista', ordenada: false, nombrada: true, items: [{ marca: 'Parte I', texto: 'Vuelo de muestra.' }, { marca: 'Parte II', texto: 'Se crea la organización de muestra.' }, { marca: 'Anexo 1', texto: 'Personal de muestra.' }, { marca: 'Anexo 2', texto: 'Reglas de prueba.' }] });
  const s3 = seccionesDeCapitulo(Buffer.from(RAD))[8];
  const b3 = estructura(Buffer.from(RAD).toString('utf8', s3.inicio, s3.fin));
  assert.deepEqual(b3.map(x => x.tipo), ['parrafo', 'titulo', 'parrafo', 'parrafo']);
  assert.equal(b3[1].texto, 'Práctica de muestra en horario nocturno');
  // Un artículo siempre abre párrafo (con su etiqueta) y la marca de página no corta la oración que sigue.
  const art = estructura('Texto de muestra que viene de antes y que es bastante largo como para parecer un PDF real.\nArticulo 20.- Cualquier aeronave de muestra que esté efectuando un vuelo deberá llevar a bordo\n=== p 7 ===\nlos documentos de prueba.\nOtra oración de muestra.');
  assert.deepEqual(art.map(x => x.tipo), ['parrafo', 'parrafo', 'pagina', 'parrafo'], 'tras un renglón corto que cierra la oración, otro párrafo');
  assert.deepEqual([art[1].etiqueta, art[1].texto], ['Articulo 20.-', 'Cualquier aeronave de muestra que esté efectuando un vuelo deberá llevar a bordo los documentos de prueba.']);
  assert.equal(art[2].n, 7);
  // Una etiqueta larga o una oración que termina en «:» no se pone en negrita.
  assert.equal(estructura('Cualquier aeronave que este efectuando un vuelo deberá llevar a bordo estos papeles de muestra:')[0].etiqueta, null);
  // El índice agrupado: los encabezados sin texto van antes de su sección.
  assert.deepEqual(filasDelIndice([{ n: 1, titulo: null, nivel: 1, encabezados: [], desde: 1 }, { n: 2, titulo: '2.9 X', nivel: 3, encabezados: [{ titulo: 'RAD 2', nivel: 1 }], desde: 6 }]),
    [{ tipo: 'seccion', n: 1, titulo: null, nivel: 1, desde: 1, parte: null }, { tipo: 'grupo', titulo: 'RAD 2', nivel: 1 }, { tipo: 'seccion', n: 2, titulo: '2.9 X', nivel: 3, desde: 6, parte: null }]);
});

// ---------- Con las fuentes en una carpeta (el servidor) ----------
const BASE = {
  formato: 'fuentes-academia', version: 1, tg: 'tg.json', imagenes: 'imagenes.json',
  libros: [{ id: 'rad-es', titulo: 'Material de Reglamento Aeronáutico (muestra)' }, { id: 'pp-en', titulo: 'Manual de piloto privado (muestra, inglés)' }],
  materias: [{ id: 'factores_humanos', num: 1, nombre: 'Factores humanos (muestra)', temas: [{ id: 't1', titulo: 'Tema', tg: [], lecturas: [{ libro: 'rad-es', archivo: 'libro-rad-es-cap01.txt', desde: 1, hasta: 2 }] }] }],
};
function conFuentes(extra, archivos, fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const dir = carpetaFuentes(config);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'fuentes-manifiesto.json'), JSON.stringify(BASE));
  writeFileSync(join(dir, 'libro-rad-es-cap01.txt'), RAD);
  writeFileSync(join(dir, 'libro-pp-en-cap01.txt'), '=== p 17 ===\n[GFDPPM 1-1]\nA sample commercial page.\n');
  if (extra) writeFileSync(join(dir, 'fuentes-manifiesto-extra.json'), JSON.stringify(extra));
  for (const [n, t] of Object.entries(archivos ?? {})) writeFileSync(join(dir, n), t);
  return Promise.resolve(fn({ db, config, dir })).finally(() => db.close());
}

test('el servidor: índice por secciones, leer una sección (anterior / siguiente), la sección de una página y buscar por secciones', async () => {
  await conFuentes(null, null, async ({ db, config }) => {
    const ind = indiceDeLibro(db, config, 'rad-es');
    assert.equal(ind.secciones.length, 11);
    assert.deepEqual(ind.secciones[4], { n: 5, titulo: '5.9 Preparación de muestra antes del vuelo', nivel: 3, encabezados: [{ titulo: 'RAD 5 – REGLAS DE MUESTRA DEL AIRE', nivel: 1 }], ruta: ['RAD 5 – REGLAS DE MUESTRA DEL AIRE'], desde: 2, hasta: 2, capitulo: 1 });
    assert.deepEqual(ind.secciones[9].ruta, ['RAD 95 – REGLAS DE OPERACION DE MUESTRA', 'Sección B ― Reglas de Prueba']);
    assert.deepEqual(ind.secciones[8].ruta, ['RAD 63 – PERMISOS Y CONSTANCIAS DE MUESTRA']);
    const s = seccionDeLibro(db, config, 'rad-es', 9);
    assert.equal(s.seccion.titulo, '63.57 Práctica reciente de muestra: piloto al mando');
    assert.match(s.texto, /^Ninguna persona de muestra debe actuar/);
    assert.doesNotMatch(s.texto, /RAD 95/);
    assert.deepEqual([s.anterior.n, s.anterior.titulo, s.siguiente.n, s.total, s.cortada], [8, '63.23 Constancias de salud: condiciones y duración de muestra', 10, 11, false]);
    assert.equal(seccionDeLibro(db, config, 'rad-es', 1).anterior, null);
    assert.equal(seccionDeLibro(db, config, 'rad-es', 11).siguiente, null);
    assert.throws(() => seccionDeLibro(db, config, 'rad-es', 12), e => e.estado === 404 || e.codigo === 404 || /no_existe/.test(e.message));
    assert.throws(() => seccionDeLibro(db, config, 'rad-es', 'x'), e => /seccion_no_valida/.test(e.message) || e.codigo === 400 || e.estado === 400);
    assert.deepEqual(paginaDeLibro(db, config, 'rad-es', 3).seccion, { n: 9, titulo: '63.57 Práctica reciente de muestra: piloto al mando', parte: null, desde: 3 });
    assert.equal(paginaDeLibro(db, config, 'rad-es', 2).seccion.titulo, 'Prohibiciones');
    // Buscar: las secciones donde aparece, con su fragmento y cuántas veces; y por página como antes.
    const b = await buscarEnLibro(db, config, 'rad-es', 'piloto al mando');
    assert.deepEqual(b.secciones.map(x => [x.n, x.titulo, x.coincidencias]), [[2, 'Marco Legal', 1], [5, '5.9 Preparación de muestra antes del vuelo', 1], [9, '63.57 Práctica reciente de muestra: piloto al mando', 3]]);
    assert.match(b.secciones[2].fragmento, /63\.57 Práctica reciente de muestra: piloto al mando/);
    assert.deepEqual(b.secciones[1].ruta, ['RAD 5 – REGLAS DE MUESTRA DEL AIRE']);
    assert.deepEqual(b.resultados.map(x => [x.pagina, x.seccion]), [[1, 2], [2, 5], [3, 9], [3, 9], [3, 9]]);
    // El libro comercial sigue cerrado (sin secciones a la vista).
    assert.throws(() => seccionDeLibro(db, config, 'pp-en', 1), /libro_no_disponible/);
  });
});

const EXTRA = {
  materias: [],
  libros: [
    { id: 'faa-phak', titulo: "Pilot's Handbook of Aeronautical Knowledge (FAA-H-8083-25C)", licencia: 'dominio_publico' },
    { id: 'pp-en', titulo: 'Intento de relicenciar el comercial', licencia: 'dominio_publico' },
    { id: 'faa-jep', titulo: 'Jeppesen Private Pilot (muestra)', licencia: 'dominio_publico' },
    { id: 'otro', titulo: 'Sin licencia', licencia: 'comercial' },
  ],
};
const PHAK = '=== p 1 ===\nChapter 1\nIntroduction to Flying\nThis sample chapter mentions a Jeppesen chart as an example only, and the text goes on.\n\nHistory of Flight\nThe sample history of flight begins with balloons and gliders, long before the airplane flew.\n=== p 2 ===\nMore sample text about the history of flight, with gliders, engines and the first powered flights of the sample. Later the sample airplanes carried mail and passengers across the country.\n';

test('el extra agrega libros de dominio público (no cambia uno del paquete, no acepta otra licencia) y la Biblioteca los muestra', async () => {
  await conFuentes(EXTRA, { 'libro-faa-phak-cap01.txt': PHAK, 'libro-faa-jep-cap01.txt': PHAK }, async ({ db, config, dir }) => {
    const u = unirExtra(dir, BASE);
    assert.deepEqual(u.libros, ['faa-phak', 'faa-jep']);
    assert.equal(u.error, 'libro_repetido');
    assert.deepEqual(u.manifiesto.libros.map(l => l.id), ['rad-es', 'pp-en', 'faa-phak', 'faa-jep']);
    assert.equal(u.manifiesto.libros[1].titulo, 'Manual de piloto privado (muestra, inglés)', 'pp-en no se relicencia');
    assert.equal(u.manifiesto.libros[2][DEL_EXTRA], true);
    assert.deepEqual(librosDelExtra(dir), ['faa-phak', 'faa-jep']);
    assert.deepEqual(leerManifiesto(dir).materias.map(m => m.id), ['factores_humanos']);
    // Clasificar: la marca DEL_EXTRA no se puede escribir en un JSON; «Jeppesen» en el texto no cierra un libro del extra,
    // pero sí uno del paquete; y un título de editorial cierra igual.
    assert.equal(clasificarLibro({ id: 'faa-phak', titulo: 'Handbook', licencia: 'dominio_publico', [DEL_EXTRA]: true }, { textoComercial: true }), 'publico');
    assert.equal(clasificarLibro({ id: 'x', titulo: 'Manual', licencia: 'dominio_publico', DEL_EXTRA: true }, { textoComercial: true }), 'comercial');
    assert.equal(clasificarLibro({ id: 'faa-jep', titulo: 'Jeppesen Private Pilot', licencia: 'dominio_publico', [DEL_EXTRA]: true }), 'comercial');
    assert.deepEqual(listaBiblioteca(db, config).libros.map(l => l.id), ['rad-es', 'faa-phak']);
    const adm = librosParaAdmin(db, config);
    assert.deepEqual(adm.map(l => [l.id, l.clase, l.permitido]), [['rad-es', 'publico', true], ['pp-en', 'comercial', false], ['faa-phak', 'publico', true], ['faa-jep', 'comercial', false]]);
    assert.throws(() => cambiarLibro(db, config, 'faa-jep', true), /libro_comercial/);
    guardarAjuste(db, AJUSTE_BIBLIOTECA, JSON.stringify({ 'pp-en': true, 'faa-jep': true }));
    assert.deepEqual(listaBiblioteca(db, config).libros.map(l => l.id), ['rad-es', 'faa-phak'], 'forzar el ajuste no abre un comercial');
    // El manual de la FAA, por secciones («Chapter 1» con su título; «History of Flight»).
    const ind = indiceDeLibro(db, config, 'faa-phak');
    assert.deepEqual(ind.secciones.map(s => s.titulo), ['Chapter 1 · Introduction to Flying', 'History of Flight']);
    assert.deepEqual(ind.secciones[1].ruta, ['Chapter 1 · Introduction to Flying']);
  });
  // Un extra solo con libros (sin materias) vale; uno con un libro no válido se informa.
  await conFuentes({ libros: [{ id: 'faa-afh', titulo: 'Airplane Flying Handbook', licencia: 'dominio_publico' }] }, null, ({ dir }) => {
    assert.deepEqual(unirExtra(dir, BASE).libros, ['faa-afh']);
    assert.equal(unirExtra(dir, BASE).error, null);
  });
  await conFuentes({ libros: [{ id: 'Mal Id', titulo: 'x', licencia: 'dominio_publico' }] }, null, ({ dir }) => {
    assert.equal(unirExtra(dir, BASE).error, 'libro_no_valido');
    assert.deepEqual(unirExtra(dir, BASE).libros, []);
  });
});

test('el armador de los manuales de la FAA (scripts/libros-faa.mjs): páginas del PDF, un archivo por capítulo y con tope', () => {
  // Lo que da pdftotext: cada página termina en «\f».
  const salida = 'Front matter\f\nChapter 1\nIntroduction to Flying\nText one.\f=== p 9 ===\nText two\u0007.\f\nChapter 2\nAerodynamics\nText three is long enough to be a real paragraph of the sample.\f';
  const paginas = paginasDePdftotext(salida);
  assert.equal(paginas.length, 4);
  assert.equal(capituloDePagina(paginas[1]), 1);
  assert.equal(capituloDePagina('Some text about Chapter 3 here'), null);
  assert.equal(limpiarPagina(paginas[2]), 'Text two.', 'sin caracteres de control ni marcas falsas de página');
  const archivos = repartirCapitulos(paginas, 'faa-phak');
  assert.deepEqual(archivos.map(a => a.nombre), ['libro-faa-phak-cap01.txt', 'libro-faa-phak-cap02.txt', 'libro-faa-phak-cap03.txt']);
  assert.equal(archivos[1].texto, '=== p 2 ===\nChapter 1\nIntroduction to Flying\nText one.\n=== p 3 ===\nText two.\n');
  assert.deepEqual(seccionesDeCapitulo(Buffer.from(archivos[2].texto)).map(x => x.titulo), ['Chapter 2 · Aerodynamics']);
  // Con tope: se parte antes de pasarlo; un id que no sirve, error.
  const muchas = Array.from({ length: 10 }, () => 'x'.repeat(300));
  assert.ok(repartirCapitulos(muchas, 'faa-afh', { tope: 1000 }).every(a => Buffer.byteLength(a.texto) <= 1000));
  assert.throws(() => repartirCapitulos(muchas, 'Mal Id'), /id_no_valido/);
  const r = resumen('faa-phak', 'PHAK', archivos);
  assert.deepEqual(r.libro, { id: 'faa-phak', titulo: 'PHAK', licencia: 'dominio_publico' });
  assert.match(r.archivos[0].sha256, /^[a-f0-9]{64}$/);
});
