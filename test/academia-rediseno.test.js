// Academia 0.7.2: la lección en tarjetas, el «Video resumen» de cada materia, el plan de estudio y el panel «Grupo».
// Todo con la muestra ORIGINAL de test/academia-muestra.js y textos escritos para esta prueba (nada de los libros).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete, audiosDe } from '../src/academia/formato.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { partirLeccion, resaltar, pareceIngles, dividirEnFrases, leerPreguntasClave, leerEscenarios, leerPalabras, textoDePantallas } from '../public/tarjetas.js';
import { leccionDeVideo, visualDeEscena, iconoDe } from '../public/academia-video.js';
import { Secuencia, duracionEscena } from '../public/clase/reproductor.js';

const CLAVE = 'una clave bien larga';
const palabras = texto => String(texto).toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];

// ---------- Tarjetas (public/tarjetas.js) ----------
const FUENTE = [{ libro: 'Libro', capitulo: '1', seccion: 'A', pagina: '3' }];
const SECCIONES = [
  { titulo: 'El motor y el calor (engine heat)', texto: 'El motor se calienta cuando trabaja mucho. Por eso hay que mirar la temperatura del aceite (oil temperature) en el panel. Si sube demasiado, evita subir con mucha potencia durante mucho tiempo. Una subida más suave enfría el motor. Esto se ve en EE. UU. y en todas partes: el aire frío ayuda 10 minutos después.', fuentes: FUENTE },
  { titulo: 'Lo que pregunta el Test Guide', texto: 'Si te preguntan: ¿Qué hace el aire frío?\nRecuerda: Ayuda a enfriar el motor.\n\nSi te preguntan: ¿Cuándo mirar el aceite?\nRecuerda: Siempre en la subida.', fuentes: FUENTE },
  { titulo: 'Practica: escenarios', texto: 'Escenario 1: Subes con mucha potencia y la aguja del aceite pasa la marca.\n  A) Sigo igual. → Error: el motor se sigue calentando.\n  B) Bajo un poco la nariz y la potencia. → Correcto según el libro: entra más aire y el motor se enfría.\n  C) Apago el motor. → Exagerado: no hace falta.\nRecuerda: Más aire, menos potencia.', fuentes: FUENTE },
  { titulo: 'Palabras de inglés del tema', texto: '• Oil temperature (OIL TEM-pe-ra-chur): Temperatura del aceite. Ejemplo: Check the oil temperature.\n• Cowl flaps (KAUL flaps): Aletas del capó. Ejemplo: Open the cowl flaps.', fuentes: FUENTE },
  { titulo: 'Resumen', texto: 'Mira el aceite. Sube suave. Más aire, menos potencia.', fuentes: FUENTE },
  { tipo: 'tarjeta', titulo: 'Ya partida', puntos: ['Uno.', 'Dos.'], recuerda: 'Tres.', ingles: [{ palabra: 'Climb', pronunciacion: 'klaim', significado: 'Subir' }], visual: { tipo: 'motor', parametros: {} }, fuentes: FUENTE },
];

test('tarjetas: cada patrón se reconoce y NINGUNA palabra de la lección se pierde al partirla', () => {
  const pantallas = partirLeccion(SECCIONES);
  const tipos = pantallas.map(p => p.tipo);
  assert.deepEqual([...new Set(tipos)].sort(), ['girar', 'situacion', 'tarjeta', 'vocabulario']);
  assert.equal(tipos.filter(x => x === 'girar').length, 2);
  // Una idea por pantalla: como mucho 3 puntos (4 si la última era muy corta) y nunca vacía.
  for (const p of pantallas.filter(x => x.tipo === 'tarjeta')) assert.ok((p.puntos.length || p.recuerda) && p.puntos.length <= 4, JSON.stringify(p));
  // El texto largo se partió en más de una tarjeta, con «Recuerda» para la frase clave (la de «evita»).
  const motor = pantallas.filter(p => p.titulo === SECCIONES[0].titulo);
  assert.ok(motor.length >= 2);
  assert.ok(motor.some(p => /evita/.test(p.recuerda ?? '')));
  // «EE. UU.» no corta la frase.
  assert.ok(dividirEnFrases('Vale en EE. UU. y aquí. Otra frase.').length === 2);
  // Nada se pierde: cada palabra de la lección (sin las marcas «Si te preguntan», «Escenario 1», «Ejemplo»…) sigue ahí.
  const todo = new Set(palabras(textoDePantallas(pantallas)));
  const marcas = new Set(['si', 'te', 'preguntan', 'recuerda', 'escenario', 'ejemplo', 'a', 'b', 'c', '1']);
  for (const s of SECCIONES) {
    for (const w of palabras([s.titulo, s.texto, ...(s.puntos ?? []), s.recuerda].filter(Boolean).join(' '))) {
      if (!marcas.has(w)) assert.ok(todo.has(w), `se perdió «${w}» de «${s.titulo}»`);
    }
  }
  // La tarjeta ya partida sale tal cual, con su dibujo y su inglés.
  const ya = pantallas.find(p => p.titulo === 'Ya partida');
  assert.deepEqual([ya.puntos, ya.recuerda, ya.visual.tipo, ya.ingles[0].palabra], [['Uno.', 'Dos.'], 'Tres.', 'motor', 'Climb']);
  // El vocabulario del tema pone fichas de inglés en las tarjetas donde aparece la palabra.
  assert.ok(motor.some(p => p.ingles.some(w => w.palabra === 'Oil temperature')));
});

test('tarjetas: los patrones, uno por uno (y si no se reconocen, nada se pierde)', () => {
  assert.deepEqual(leerPreguntasClave('Si te preguntan: ¿Uno?\nRecuerda: Dos.').tarjetas, [{ pregunta: '¿Uno?', respuesta: 'Dos.' }]);
  assert.equal(leerPreguntasClave('Un texto normal.'), null);
  const e = leerEscenarios(SECCIONES[2].texto).escenarios[0];
  assert.equal(e.opciones.length, 3);
  assert.deepEqual(e.opciones.map(o => o.correcta), [false, true, false]);
  assert.equal(e.recuerda, 'Más aire, menos potencia.');
  // Sin una única correcta no es un escenario: queda como texto.
  assert.equal(leerEscenarios('Escenario 1: Algo.\n  A) Uno. → Bien.\n  B) Dos. → Mal.'), null);
  assert.equal(partirLeccion([{ titulo: 'Practica: escenarios', texto: 'Escenario 1: Algo.\n  A) Uno. → Bien.\n  B) Dos. → Mal.', fuentes: FUENTE }])[0].tipo, 'tarjeta');
  const v = leerPalabras(SECCIONES[3].texto).palabras;
  assert.deepEqual(v[1], { palabra: 'Cowl flaps', pronunciacion: 'KAUL flaps', significado: 'Aletas del capó.', ejemplo: 'Open the cowl flaps.' });
});

test('resaltar: los trozos juntos dicen exactamente el texto; marca el inglés entre paréntesis y las cifras', () => {
  for (const texto of [SECCIONES[0].texto, 'Mira 5° a 10° al lado (off-center viewing) por 30 minutos (no en español).', '', 'Sin nada']) {
    const trozos = resaltar(texto);
    assert.equal(trozos.map(x => x.texto).join(''), texto);
  }
  const t = resaltar('Mira 5° a 10° al lado (off-center viewing) por 30 minutos (no en español).');
  assert.deepEqual(t.filter(x => x.ingles).map(x => x.texto), ['(off-center viewing)']);
  assert.deepEqual(t.filter(x => x.cifra).map(x => x.texto), ['5°', '10°', '30 minutos']);
  // Un paréntesis en español nunca sale como ficha de inglés (ante la duda, no).
  for (const es of ['ala izquierda', 'Figura 10-28', 'nieve', 'altitud', 'descensos lentos, spray nasal, Valsalva', 'oscuridad o mal tiempo', 'FAR', 'EE. UU.', 'complacencia']) assert.equal(pareceIngles(es), false, es);
  for (const en of ['off-center viewing', 'cornea', 'the bends', 'peer pressure', 'readback']) assert.equal(pareceIngles(en), true, en);
  assert.equal(pareceIngles('visual illusions', { titulo: true }), true);
});

// ---------- El video resumen → la lección del reproductor ----------
test('video: un dibujo que no sirve (o desconocido, o un escenario sin opciones) usa el cartel; el video nunca espera', () => {
  const video = {
    materia: 'factores_humanos',
    escenas: [
      { id: 'escena-1', inicio_s: 0, fin_s: 10, subtitulo: 'Los ojos de noche', texto_pantalla: 'Mira al lado.', visual: { tipo: 'ilustracion', parametros: {} } },
      { id: 'escena-2', inicio_s: 10, fin_s: 25.5, subtitulo: 'Decidir', texto_pantalla: 'Piensa antes.', visual: { tipo: 'escenario', parametros: { tema: 'sin opciones' } } },
      { id: 'escena-3', inicio_s: 25.5, fin_s: 30, subtitulo: 'El panel', texto_pantalla: 'Los instrumentos.', visual: { tipo: 'instrumentos', parametros: {} } },
      { id: 'escena-4', inicio_s: 30, fin_s: 40, subtitulo: 'Monóxido', texto_pantalla: 'Gas invisible.', visual: { tipo: 'meteo', parametros: {} } },
    ],
  };
  const l = leccionDeVideo(video, { titulo: 'T', audioUrl: '/api/academia/audio/1~a.mp3' });
  assert.equal(l.audio_url, '/api/academia/audio/1~a.mp3');
  assert.deepEqual(l.escenas.map(e => e.visual.tipo), ['cartel', 'cartel', 'instrumentos', 'cartel']);
  assert.equal(l.escenas[0].visual.parametros.icono, 'ojo');
  assert.equal(iconoDe('El monóxido de carbono'), 'motor');
  // Cada escena dura lo que dice su tiempo dentro del mp3; ninguna espera respuesta (avanza sola hasta el final).
  assert.deepEqual(l.escenas.map(e => duracionEscena(e)), [10, 15.5, 4.5, 10]);
  const seq = new Secuencia(l);
  let fin = null;
  for (let i = 0; i < 100 && !fin; i++) fin = seq.avanzar(1) === 'fin' ? 'fin' : null;
  assert.equal(fin, 'fin');
  // Un escenario de verdad (con sus opciones) sí se usa.
  const bueno = { situacion: 'Algo', concepto: 'Idea', opciones: [{ texto: 'a', correcta: true, consecuencia: 'x' }, { texto: 'b', correcta: false, consecuencia: 'y' }] };
  assert.equal(visualDeEscena({ subtitulo: 's', visual: { tipo: 'escenario', parametros: bueno } }, 0).tipo, 'escenario');
  // Solo la narración, sin escenas: una escena con el título, del largo del audio.
  const solo = leccionDeVideo({ materia: 'x', escenas: [] }, { titulo: 'Resumen', audioUrl: '/a', duracionAudio: 377 });
  assert.deepEqual([solo.escenas.length, solo.escenas[0].fin_s, solo.escenas[0].visual.tipo], [1, 377, 'titulo']);
});

// ---------- El formato del paquete ----------
function paqueteConTodo() {
  const p = paqueteMuestra();
  p.materias[0].video = {
    titulo: 'Resumen de muestra', audio: { archivo: 'resumen-muestra.mp3' },
    escenas: [
      { inicio_s: 0, fin_s: 12, subtitulo: 'Empieza', texto_pantalla: 'Una frase.', visual: { tipo: 'titulo', parametros: { titulo: 'Hola' } }, otra_cosa: 'se ignora' },
      { inicio_s: 12, fin_s: 20.5, subtitulo: 'Sigue', visual: { tipo: 'ilustracion' } },
    ],
  };
  p.materias[0].temas[0].secciones.push({ tipo: 'tarjeta', titulo: 'Una tarjeta', puntos: ['Uno.', 'Dos.'], recuerda: 'Tres.', ingles: [{ palabra: 'Climb' }], visual: { tipo: 'motor' }, fuentes: p.materias[0].temas[0].secciones[0].fuentes });
  // Un tema sin preguntas (se aprueba al leer su lección).
  p.materias[0].temas.unshift({ id: 'muestra-lectura', titulo: 'Solo lectura (muestra)', secciones: [{ titulo: 'Leer', texto: 'Un texto de muestra.', fuentes: p.materias[0].temas[0].secciones[0].fuentes }], preguntas: [] });
  return p;
}

test('formato 0.7.2: tarjeta y video resumen son opcionales; sus errores dicen dónde están', () => {
  const p = paqueteConTodo();
  const r = revisarPaquete(p);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.audios.map(a => a.archivo), ['resumen-muestra.mp3']);
  assert.deepEqual(audiosDe(p).map(a => a.archivo), ['resumen-muestra.mp3']);
  const mal = paqueteConTodo();
  mal.materias[0].video.escenas[1].fin_s = 5;
  mal.materias[0].video.escenas[0].visual = { tipo: 'Con Espacios' };
  mal.materias[0].temas[1].secciones.at(-1).puntos = [];
  mal.materias[0].temas[1].secciones.push({ tipo: 'otra', titulo: 'x', texto: 'y', fuentes: [] });
  const e = new Set(revisarPaquete(mal).errores.map(x => `${x.ruta}:${x.motivo}`));
  assert.ok(e.has('materias[0].video.escenas[1].fin_s:tiempo_no_valido'), [...e].join('\n'));
  assert.ok(e.has('materias[0].video.escenas[0].visual.tipo:tipo_desconocido'));
  assert.ok([...e].some(x => /secciones\[\d+\]\.puntos:no_es_lista/.test(x)));
  assert.ok([...e].some(x => /secciones\[\d+\]\.tipo:tipo_desconocido/.test(x)));
  // Un video sin escenas y sin audio no sirve; con solo el audio, sí.
  const solo = paqueteMuestra();
  solo.materias[0].video = {};
  assert.ok(revisarPaquete(solo).errores.some(x => x.ruta === 'materias[0].video.escenas' && x.motivo === 'falta'));
  solo.materias[0].video = { audio: { archivo: 'solo.mp3' } };
  assert.equal(revisarPaquete(solo).ok, true);
});

// ---------- Con el servidor: video, plan, grupo y tema de solo lectura ----------
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) o.headers.Cookie = galleta;
  if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) o.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, o);
  const tipo = r.headers.get('content-type') || '';
  const contenido = tipo.includes('json') ? await r.json().catch(() => ({})) : Buffer.from(await r.arrayBuffer());
  const c = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, tipo, cabeceras: r.headers, galleta: c ? c.split(';')[0] : null };
}
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.alloc(4000, 7)]);

test('servidor: video resumen (con su mp3 por partes), plan de estudio, grupo sin datos privados y tema de solo lectura', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    const g = {};
    for (const [nombre, visible] of [['ana', 'Ana'], ['beto', 'Beto'], ['caro', 'Caro']]) {
      crearUsuario(db, { nombre, nombreVisible: visible, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      g[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const p = paqueteConTodo();
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
    assert.equal(s.codigo, 201, JSON.stringify(s.datos));
    assert.deepEqual(s.datos.faltanAudio, ['resumen-muestra.mp3']);
    const id = s.datos.paquete.id;
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);

    // El camino trae el video (aún sin su mp3), el plan sin elegir y el grupo.
    let c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: g.ana })).datos;
    const m = c.materias.find(x => x.id === 'factores_humanos');
    assert.deepEqual(m.video, { escenas: 2, audio: false, duracion: 21, visto: false });
    assert.equal(c.plan.elegido, null);
    assert.deepEqual(c.plan.opciones.map(o => [o.id, o.dias, o.recomendado]), [['un_mes', 30, true], ['dos_meses', 60, false], ['repaso_15', 15, false]]);
    assert.equal(c.preparacion.pct, 0);
    let v = (await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: g.ana })).datos;
    assert.equal(v.audio, null);
    assert.deepEqual(v.escenas.map(e => [e.inicio_s, e.fin_s, e.subtitulo, e.visual?.tipo ?? null]), [[0, 12, 'Empieza', 'titulo'], [12, 20.5, 'Sigue', 'ilustracion']]);
    assert.equal(v.escenas[0].otra_cosa, undefined);
    assert.equal((await pedir(base, 'GET', '/api/academia/video/sistemas', { galleta: g.ana })).codigo, 404);

    // Llega el mp3: el video lo trae y se sirve por partes (Range), solo con la sesión.
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/audio/resumen-muestra.mp3`, { galleta: admin, cabeceras: { 'Content-Type': 'audio/mpeg' }, cuerpo: MP3 })).codigo, 201);
    v = (await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: g.ana })).datos;
    assert.ok(v.audio?.ref);
    const parte = await pedir(base, 'GET', `/api/academia/audio/${encodeURIComponent(v.audio.ref)}`, { galleta: g.ana, cabeceras: { Range: 'bytes=0-1' } });
    assert.equal(parte.codigo, 206);
    assert.match(parte.tipo, /audio\/mpeg/);
    assert.equal(parte.cabeceras.get('content-range'), `bytes 0-1/${MP3.length}`);
    assert.equal((await pedir(base, 'GET', `/api/academia/audio/${encodeURIComponent(v.audio.ref)}`)).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/academia/video/factores_humanos/visto', { galleta: g.ana, datos: {} })).codigo, 200);
    c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: g.ana })).datos;
    assert.equal(c.materias[0].video.visto, true);
    assert.equal(c.materias[0].video.audio, true);

    // El plan: uno que no existe no; elegir uno da la fecha estimada; cambiarlo guarda el día en que empezó.
    assert.equal((await pedir(base, 'POST', '/api/academia/plan', { galleta: g.ana, datos: { plan: 'un_ano' } })).datos.error, 'plan_estudio_no_valido');
    const plan = (await pedir(base, 'POST', '/api/academia/plan', { galleta: g.ana, datos: { plan: 'un_mes' } })).datos.plan;
    assert.equal(plan.elegido, 'un_mes');
    assert.match(plan.fin, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(plan.hechos, 0);
    assert.ok(plan.total > 11 && plan.metaHoy >= 1);
    const otro = (await pedir(base, 'POST', '/api/academia/plan', { galleta: g.ana, datos: { plan: 'dos_meses' } })).datos.plan;
    assert.equal(otro.desde, plan.desde);
    assert.ok(otro.fin >= plan.fin);
    assert.equal((await pedir(base, 'GET', '/api/academia/progreso', { galleta: g.ana })).datos.plan.elegido, 'dos_meses');

    // Tema de solo lectura (sin preguntas): leerlo entero lo aprueba y abre el siguiente; uno cerrado no se puede marcar.
    let temas = (await pedir(base, 'GET', '/api/academia/camino', { galleta: g.beto })).datos.materias[0].temas;
    assert.deepEqual(temas.map(x => x.estado), ['abierto', 'bloqueado', 'bloqueado']);
    assert.equal((await pedir(base, 'POST', '/api/academia/temas/factores_humanos/muestra-ilusiones/leido', { galleta: g.beto, datos: {} })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/academia/temas/factores_humanos/muestra-lectura/leido', { galleta: g.beto, datos: {} })).datos.estado, 'aprobado');
    temas = (await pedir(base, 'GET', '/api/academia/camino', { galleta: g.beto })).datos.materias[0].temas;
    assert.deepEqual(temas.map(x => x.estado), ['aprobado', 'abierto', 'bloqueado']);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: g.ana })).datos.materias[0].temas[0].estado, 'abierto');

    // El grupo: solo nombre, materia, % del camino, racha y medallas. Nunca notas, errores ni conexión.
    let grupo = (await pedir(base, 'GET', '/api/academia/camino', { galleta: g.ana })).datos.grupo;
    assert.equal(grupo.activo, true);
    assert.deepEqual(grupo.companeros.map(x => x.nombre).sort(), ['Ana', 'Beto', 'Caro']);
    for (const x of grupo.companeros) assert.deepEqual(Object.keys(x).sort(), ['lugar', 'materia', 'medallas', 'nombre', 'pct', 'racha', 'tu']);
    assert.deepEqual(grupo.companeros.filter(x => x.tu).map(x => x.nombre), ['Ana']);
    // Beto se oculta: Ana ya no lo ve; él se sigue viendo (marcado «oculto»).
    assert.equal((await pedir(base, 'POST', '/api/academia/grupo', { galleta: g.beto, datos: { oculto: 'si' } })).codigo, 400);
    const deBeto = (await pedir(base, 'POST', '/api/academia/grupo', { galleta: g.beto, datos: { oculto: true } })).datos.grupo;
    assert.equal(deBeto.oculto, true);
    assert.ok(deBeto.companeros.some(x => x.tu));
    grupo = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: g.ana })).datos.grupo;
    assert.deepEqual(grupo.companeros.map(x => x.nombre).sort(), ['Ana', 'Caro']);
    // Un administrador que también estudia (eligió un plan) sale en el grupo.
    await pedir(base, 'POST', '/api/academia/plan', { galleta: admin, datos: { plan: 'un_mes' } });
    grupo = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: g.ana })).datos.grupo;
    assert.deepEqual(grupo.companeros.map(x => x.nombre).sort(), ['Ana', 'Caro', 'junior']);
    // Solo el administrador apaga el panel; apagado, nadie ve a nadie.
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/grupo', { galleta: g.ana, datos: { encendido: false } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/grupo', { galleta: admin, datos: { encendido: false } })).datos.grupo, false);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos.grupo, false);
    grupo = (await pedir(base, 'GET', '/api/academia/camino', { galleta: g.caro })).datos.grupo;
    assert.deepEqual([grupo.activo, grupo.companeros], [false, []]);
  });
  db.close();
});
