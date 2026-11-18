// Pruebas de la 0.14.38: la «Competencia» (src/academia/competencia.js, src/api/competencia.js). Sin internet y sin IA:
// la competencia funciona entera sin ella. Reloj fijo (academia.reloj): todo es determinista.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { SEMILLA, RONDAS, DIBUJOS, LETRAS, bandaDe, BANDAS, VARIANTES_FRASE, limpiarComentario, CAMPOS_IA } from '../src/academia/competencia.js';
import { guardarFrase, guardarSugerencia, limpiarFrase, armarFrase, armarMejora } from '../src/academia/competencia-ia.js';
import { FORMATO_CODIGO } from '../src/academia/certificados.js';
import { PROPOSITOS } from '../src/ia/propositos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ES = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const EN = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  const texto = await r.text();
  let contenido = {};
  try { contenido = JSON.parse(texto); } catch { contenido = {}; }
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, texto, galleta: setCookie ? setCookie.split(';')[0] : null };
}

async function conCompetencia(fn, { limitesCompetencia } = {}) {
  const reloj = { ahora: Date.parse('2026-11-18T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora, limitesCompetencia } });
  await conServidor(servidor, async base => {
    const a = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(a.codigo, 201);
    const ids = {};
    const g = {};
    for (const nombre of ['ana', 'beto', 'carla', 'dario']) {
      ids[nombre] = crearUsuario(db, { nombre, nombreVisible: `${nombre[0].toUpperCase()}${nombre.slice(1)} Pérez`, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      g[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    await fn({ base, db, admin: a.galleta, g, ids, reloj });
  });
  db.close();
}

// Juega una ronda entera: buenas = cuántas acierta (las primeras). → la última respuesta.
async function jugar(c, quien, n, buenas = 20, { pasoMs = 5000 } = {}) {
  const e = await pedir(c.base, 'POST', `/api/academia/competencia/${n}/empezar`, { galleta: c.g[quien], datos: {} });
  assert.equal(e.codigo, 200, JSON.stringify(e.datos));
  let ultima = null;
  for (let i = 0; i < 20; i++) {
    const v = await pedir(c.base, 'GET', `/api/academia/competencia/${n}`, { galleta: c.g[quien] });
    assert.equal(v.datos.estado, 'jugando');
    const q = v.datos.actual;
    const buena = SEMILLA[n].preguntas.find(x => x.id === q.id).correcta;
    c.reloj.ahora += pasoMs;
    const elegida = i < buenas ? buena : LETRAS.find(l => l !== buena);
    ultima = await pedir(c.base, 'POST', `/api/academia/competencia/${n}/responder`, { galleta: c.g[quien], datos: { pregunta: q.id, elegida } });
    assert.equal(ultima.codigo, 200, JSON.stringify(ultima.datos));
  }
  return ultima.datos;
}

test('las 120 preguntas: 6 rondas de 20, ids únicos, A/B/C, la correcta repartida, todo con explicación, chistes y dibujo', () => {
  const archivos = readdirSync(join(RAIZ, 'src/academia/competencia')).sort();
  assert.deepEqual(archivos, RONDAS.map(n => `ronda-${n}.json`));
  const ids = new Set();
  const textos = new Set();
  for (const n of RONDAS) {
    const r = SEMILLA[n];
    assert.equal(r.preguntas.length, 20, `ronda ${n}`);
    assert.ok(r.titulo && r.lema);
    const cuenta = { A: 0, B: 0, C: 0 };
    for (const q of r.preguntas) {
      assert.match(q.id, new RegExp(`^r${n}-\\d{2}$`));
      assert.ok(!ids.has(q.id), q.id);
      ids.add(q.id);
      assert.deepEqual(Object.keys(q.opciones), LETRAS, q.id);
      assert.ok(LETRAS.includes(q.correcta), q.id);
      cuenta[q.correcta]++;
      assert.equal(new Set(Object.values(q.opciones)).size, 3, `${q.id}: opciones repetidas`);
      for (const k of ['pregunta', 'explicacion', 'bien', 'mal']) assert.ok(typeof q[k] === 'string' && q[k].trim().length > 5, `${q.id}.${k}`);
      assert.ok(q.pregunta.length <= 220 && q.explicacion.length <= 260 && q.bien.length <= 140 && q.mal.length <= 140, `${q.id}: muy largo`);
      assert.ok(DIBUJOS.includes(q.dibujo), `${q.id}: dibujo ${q.dibujo}`);
      assert.ok(!textos.has(q.pregunta), `${q.id}: pregunta repetida`);
      textos.add(q.pregunta);
      // Nada de precios, enlaces ni promoción.
      assert.doesNotMatch(JSON.stringify(q), /US\$|\$\d|https?:|www\.|claude|anthropic|openai|chatgpt/i, q.id);
    }
    for (const l of LETRAS) assert.ok(cuenta[l] >= 6 && cuenta[l] <= 7, `ronda ${n}: ${JSON.stringify(cuenta)}`);
  }
  assert.equal(ids.size, 120);
});

test('una sola vez por ronda: empezar otra vez, recargar o adivinar la siguiente nunca vuelve atrás ni reinicia el reloj', () => conCompetencia(async c => {
  const { base, g } = c;
  const nueva = await pedir(base, 'GET', '/api/academia/competencia/1', { galleta: g.ana });
  assert.equal(nueva.datos.estado, 'nueva');
  assert.equal(nueva.datos.actual, undefined);
  const e = await pedir(base, 'POST', '/api/academia/competencia/1/empezar', { galleta: g.ana, datos: {} });
  const q1 = e.datos.actual;
  assert.equal(q1.numero, 1);
  // La pregunta llega SIN la respuesta, sin la explicación y sin los chistes.
  assert.deepEqual(Object.keys(q1).sort(), ['dibujo', 'id', 'numero', 'opciones', 'pregunta', 'quedanMs', 'total']);
  assert.doesNotMatch(e.texto, /correcta|explicacion|"bien"|"mal"/);
  // Recargar 20 s después: la misma pregunta y el reloj sigue (no vuelve a 45 s).
  c.reloj.ahora += 20_000;
  const otra = await pedir(base, 'POST', '/api/academia/competencia/1/empezar', { galleta: g.ana, datos: {} });
  assert.equal(otra.datos.actual.id, q1.id);
  assert.equal(otra.datos.actual.quedanMs, 25_000);
  assert.equal((await pedir(base, 'GET', '/api/academia/competencia/1', { galleta: g.ana })).datos.actual.quedanMs, 25_000);
  // Responder otra que no es la suya (la siguiente adivinando el id) no se puede.
  const adivinar = await pedir(base, 'POST', '/api/academia/competencia/1/responder', { galleta: g.ana, datos: { pregunta: 'r1-02', elegida: 'A' } });
  assert.deepEqual([adivinar.codigo, adivinar.datos.error], [409, 'pregunta_no_es_la_actual']);
  const r = await pedir(base, 'POST', '/api/academia/competencia/1/responder', { galleta: g.ana, datos: { pregunta: q1.id, elegida: SEMILLA[1].preguntas[0].correcta } });
  assert.equal(r.datos.correcta, true);
  assert.equal(r.datos.humor, SEMILLA[1].preguntas[0].bien);
  assert.equal(r.datos.explicacion, SEMILLA[1].preguntas[0].explicacion);
  // Responder la misma otra vez (doble toque): no cuenta dos veces.
  const doble = await pedir(base, 'POST', '/api/academia/competencia/1/responder', { galleta: g.ana, datos: { pregunta: q1.id, elegida: 'A' } });
  assert.deepEqual([doble.codigo, doble.datos.error], [409, 'pregunta_no_es_la_actual']);
  // La 2 todavía no se le sirvió (está leyendo la explicación): tampoco se puede responder sin verla.
  const sinVer = await pedir(base, 'POST', '/api/academia/competencia/1/responder', { galleta: g.ana, datos: { pregunta: 'r1-02', elegida: 'A' } });
  assert.equal(sinVer.codigo, 409);
  // Leer la explicación 30 s no le quita tiempo a la siguiente: su reloj empieza al pedirla.
  c.reloj.ahora += 30_000;
  const v2 = await pedir(base, 'GET', '/api/academia/competencia/1', { galleta: g.ana });
  assert.deepEqual([v2.datos.actual.numero, v2.datos.actual.quedanMs], [2, 45_000]);
  // Con el tiempo pasado (más la gracia), cuenta como mala aunque elija la buena.
  c.reloj.ahora += 54_000;
  const tarde = await pedir(base, 'POST', '/api/academia/competencia/1/responder', { galleta: g.ana, datos: { pregunta: 'r1-02', elegida: SEMILLA[1].preguntas[1].correcta } });
  assert.deepEqual([tarde.datos.correcta, tarde.datos.aTiempo, tarde.datos.aciertos], [false, false, 1]);
  // Una base con un solo intento por alumno y ronda, aunque se pida «empezar» muchas veces.
  for (let k = 0; k < 3; k++) await pedir(base, 'POST', '/api/academia/competencia/1/empezar', { galleta: g.ana, datos: {} });
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_compe_intentos WHERE usuario_id = ? AND ronda = 1').get(c.ids.ana).n, 1);
}));

test('todos juegan las mismas preguntas en el mismo orden; la puntuación cuenta solo las buenas; terminada no se vuelve a jugar', () => conCompetencia(async c => {
  const vistas = {};
  for (const quien of ['ana', 'beto']) {
    await pedir(c.base, 'POST', '/api/academia/competencia/2/empezar', { galleta: c.g[quien], datos: {} });
    vistas[quien] = [];
  }
  const fin = await jugar(c, 'ana', 2, 13);
  assert.deepEqual([fin.terminada, fin.aciertos, fin.total], [true, 13, 20]);
  await jugar(c, 'beto', 2, 20);
  const ordenAna = c.db.prepare('SELECT pregunta FROM academia_compe_respuestas WHERE usuario_id = ? ORDER BY orden').all(c.ids.ana).map(f => f.pregunta);
  const ordenBeto = c.db.prepare('SELECT pregunta FROM academia_compe_respuestas WHERE usuario_id = ? ORDER BY orden').all(c.ids.beto).map(f => f.pregunta);
  assert.deepEqual(ordenAna, ordenBeto);
  assert.deepEqual(ordenAna, SEMILLA[2].preguntas.map(q => q.id));
  const e = await pedir(c.base, 'GET', '/api/academia/competencia/2', { galleta: c.g.ana });
  assert.equal(e.datos.estado, 'terminada');
  assert.deepEqual([e.datos.resultado.aciertos, e.datos.resultado.malas], [13, 7]);
  const otra = await pedir(c.base, 'POST', '/api/academia/competencia/2/empezar', { galleta: c.g.ana, datos: {} });
  assert.equal(otra.datos.estado, 'terminada');
  const responder = await pedir(c.base, 'POST', '/api/academia/competencia/2/responder', { galleta: c.g.ana, datos: { pregunta: 'r2-01', elegida: 'A' } });
  assert.deepEqual([responder.codigo, responder.datos.error], [409, 'ronda_terminada']);
  // La competencia no toca el Test Guide: ni respuestas ni intentos del curso.
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas').get().n, 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_intentos').get().n, 0);
  // Una ronda que no existe.
  assert.equal((await pedir(c.base, 'GET', '/api/academia/competencia/7', { galleta: c.g.ana })).codigo, 404);
}));

test('la tabla: medallas, puestos y privacidad («Perfil privado» → «Piloto N»; nunca ids ni usuarios); el administrador ve los nombres', () => conCompetencia(async c => {
  guardarAjuste(c.db, `academia.grupo_oculto.${c.ids.carla}`, '1'); // Carla: perfil privado
  await jugar(c, 'ana', 3, 15);
  await jugar(c, 'beto', 3, 18);
  await jugar(c, 'carla', 3, 20);
  await jugar(c, 'dario', 3, 15, { pasoMs: 9000 }); // mismas buenas que Ana, más lento
  const t = await pedir(c.base, 'GET', '/api/academia/competencia/3/tabla', { galleta: c.g.dario });
  const filas = t.datos.tabla;
  assert.deepEqual(filas.map(f => [f.puesto, f.medalla, f.aciertos]), [[1, 'oro', 20], [2, 'plata', 18], [3, 'bronce', 15], [4, null, 15]]);
  assert.match(filas[0].nombre, /^Piloto \d+$/, 'el perfil privado sale como Piloto N');
  assert.equal(filas[1].nombre, 'Beto');
  assert.equal(filas[3].esYo, true);
  for (const f of filas) assert.equal(f.usuarioId, undefined);
  assert.doesNotMatch(t.texto, /carla|Carla|Pérez|usuarioId|"id"/);
  // La general (con las rondas sumadas) y la portada, igual de privadas.
  const portada = await pedir(c.base, 'GET', '/api/academia/competencia', { galleta: c.g.ana });
  assert.doesNotMatch(portada.texto, /carla|Carla/);
  assert.equal(portada.datos.rondas[2].puesto, 3);
  assert.equal(portada.datos.general[0].aciertos, 20);
  // El administrador: con nombres y su id, y 403 para los alumnos.
  const adm = await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.admin });
  assert.equal(adm.datos.rondas[2].tabla[0].nombre, 'Carla Pérez');
  assert.equal(adm.datos.rondas[2].tabla[0].usuarioId, c.ids.carla);
  assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.g.ana })).codigo, 403);
  // Sin «Mostrar nombres en la carrera», todos son «Piloto N».
  guardarAjuste(c.db, 'academia.carrera_nombres', '0');
  const sin = await pedir(c.base, 'GET', '/api/academia/competencia/3/tabla', { galleta: c.g.ana });
  assert.ok(sin.datos.tabla.filter(f => !f.esYo).every(f => /^Piloto \d+$/.test(f.nombre)));
}));

test('certificado de recuerdo por ronda terminada (una vez, código verificable, frase por banda) y nada antes de terminar', () => conCompetencia(async c => {
  await pedir(c.base, 'POST', '/api/academia/competencia/4/empezar', { galleta: c.g.ana, datos: {} });
  assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.g.ana })).datos.certificados, []);
  await jugar(c, 'ana', 4, 17);
  const a = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.g.ana })).datos.certificados;
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].ronda, a[0].aciertos, a[0].banda, a[0].frase, a[0].nombre], [4, 17, 'alto', null, 'Ana Pérez']);
  assert.match(a[0].codigo, FORMATO_CODIGO);
  assert.match(a[0].codigo, /^AA-C4-/);
  assert.ok(a[0].variante >= 1 && a[0].variante <= VARIANTES_FRASE);
  // Mirarlo otra vez: el mismo código.
  const b = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.g.ana })).datos.certificados;
  assert.equal(b[0].codigo, a[0].codigo);
  const v = await pedir(c.base, 'GET', `/api/certificados/verificar/${a[0].codigo}`, { galleta: c.g.beto });
  assert.deepEqual([v.datos.valido, v.datos.curso, v.datos.ronda, v.datos.aciertos, v.datos.nombre], [true, 'compe', 4, 17, 'Ana Pérez']);
  // Las bandas (sobre 20) y sus frases fijas en los dos idiomas (cortas, sin empresas).
  assert.deepEqual([20, 19, 17, 16, 13, 12, 9, 8, 0].map(x => bandaDe(x, 20)), ['perfecto', 'alto', 'alto', 'medio', 'medio', 'bajo', 'bajo', 'muy_bajo', 'muy_bajo']);
  for (const [banda] of BANDAS) {
    for (let k = 1; k <= VARIANTES_FRASE; k++) {
      for (const idioma of [ES, EN]) {
        const f = idioma[`compe.frase.${banda}.${k}`];
        assert.ok(f && f.length <= 200, `compe.frase.${banda}.${k}`);
        assert.doesNotMatch(f, /claude|anthropic|openai|chatgpt/i);
      }
    }
    assert.ok(ES[`compe.cert.titular.${banda}`] && EN[`compe.cert.titular.${banda}`]);
  }
}));

test('lo que falló va a «Mi repaso» (con la buena y la explicación)', () => conCompetencia(async c => {
  await jugar(c, 'beto', 5, 18);
  const r = await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.g.beto });
  assert.equal(r.codigo, 200);
  const f = r.datos.competencia;
  assert.equal(f.length, 2);
  assert.deepEqual(f.map(x => x.id), ['r5-19', 'r5-20']);
  assert.equal(f[0].buena, SEMILLA[5].preguntas[18].correcta);
  assert.notEqual(f[0].elegida, f[0].buena);
  assert.equal(f[0].explicacion, SEMILLA[5].preguntas[18].explicacion);
  assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.g.ana })).datos.competencia, []);
}));

test('la galería: todos ven los certificados de todos (con alias), reaccionan, comentan sin enlaces, con tope; el administrador borra y silencia', () => conCompetencia(async c => {
  guardarAjuste(c.db, `academia.grupo_oculto.${c.ids.ana}`, '1');
  await jugar(c, 'ana', 6, 8);
  await jugar(c, 'beto', 6, 20);
  const gal = await pedir(c.base, 'GET', '/api/academia/competencia/6/certificados', { galleta: c.g.carla });
  assert.equal(gal.datos.certificados.length, 2);
  const deAna = gal.datos.certificados.find(x => x.aciertos === 8);
  assert.match(deAna.nombre, /^Piloto \d+$/);
  assert.equal(deAna.banda, 'muy_bajo');
  assert.doesNotMatch(gal.texto, /Ana|usuarioId/);
  const codigo = deAna.codigo;
  // Reaccionar (y quitar con el mismo toque).
  const ruta = `/api/academia/competencia/6/certificados/${codigo}`;
  assert.equal((await pedir(c.base, 'POST', `${ruta}/reaccion`, { galleta: c.g.carla, datos: { emoji: '😂' } })).datos.puesta, true);
  assert.equal((await pedir(c.base, 'POST', `${ruta}/reaccion`, { galleta: c.g.beto, datos: { emoji: '😂' } })).datos.puesta, true);
  assert.equal((await pedir(c.base, 'POST', `${ruta}/reaccion`, { galleta: c.g.beto, datos: { emoji: '😂' } })).datos.puesta, false);
  assert.equal((await pedir(c.base, 'POST', `${ruta}/reaccion`, { galleta: c.g.beto, datos: { emoji: '💩' } })).codigo, 400);
  const g2 = (await pedir(c.base, 'GET', '/api/academia/competencia/6/certificados', { galleta: c.g.carla })).datos.certificados.find(x => x.codigo === codigo);
  assert.deepEqual([g2.reacciones['😂'], g2.mias], [1, ['😂']]);
  // Comentar: corto, sin enlaces.
  assert.equal((await pedir(c.base, 'POST', `${ruta}/comentario`, { galleta: c.g.carla, datos: { texto: '¡Dale, que la próxima es tuya! ✈️' } })).codigo, 201);
  for (const malo of ['mira www.ejemplo.com', 'https://x.y', 'visita pagina.com', 'x'.repeat(201), '   ']) {
    const r = await pedir(c.base, 'POST', `${ruta}/comentario`, { galleta: c.g.carla, datos: { texto: malo } });
    assert.equal(r.codigo, 400, malo);
    assert.ok(['sin_enlaces', 'comentario_no_valido'].includes(r.datos.error));
  }
  assert.equal(limpiarComentario('  hola\n\nmundo  '), 'hola mundo');
  const g3 = (await pedir(c.base, 'GET', '/api/academia/competencia/6/certificados', { galleta: c.g.beto })).datos.certificados.find(x => x.codigo === codigo);
  assert.equal(g3.comentarios.length, 1);
  assert.equal(g3.comentarios[0].nombre, 'Carla');
  assert.equal(g3.comentarios[0].esYo, false);
  // Un certificado que no existe.
  assert.equal((await pedir(c.base, 'POST', '/api/academia/competencia/6/certificados/AA-C6-ZZZZ-ZZZZ/comentario', { galleta: c.g.carla, datos: { texto: 'hola' } })).codigo, 404);
  // El administrador: ve el id, borra el comentario (queda marcado, no se borra la fila) y silencia a Carla.
  const adm = (await pedir(c.base, 'GET', '/api/admin/academia/competencia/6/certificados', { galleta: c.admin })).datos.certificados.find(x => x.codigo === codigo);
  assert.equal(adm.comentarios[0].usuarioId, c.ids.carla);
  assert.equal((await pedir(c.base, 'POST', `/api/academia/competencia/comentarios/${adm.comentarios[0].id}/borrar`, { galleta: c.g.beto, datos: {} })).codigo, 403);
  assert.equal((await pedir(c.base, 'POST', `/api/academia/competencia/comentarios/${adm.comentarios[0].id}/borrar`, { galleta: c.admin, datos: {} })).codigo, 200);
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_compe_comentarios WHERE borrado_en IS NOT NULL').get().n, 1);
  assert.equal((await pedir(c.base, 'GET', '/api/academia/competencia/6/certificados', { galleta: c.g.beto })).datos.certificados.find(x => x.codigo === codigo).comentarios.length, 0);
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/silenciar', { galleta: c.admin, datos: { usuarioId: c.ids.carla, silenciado: true } })).codigo, 200);
  const callada = await pedir(c.base, 'POST', `${ruta}/comentario`, { galleta: c.g.carla, datos: { texto: 'hola otra vez' } });
  assert.deepEqual([callada.codigo, callada.datos.error], [403, 'silenciado']);
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/silenciar', { galleta: c.g.beto, datos: { usuarioId: c.ids.carla, silenciado: true } })).codigo, 403);
}));

test('el tope de comentarios por persona', () => conCompetencia(async c => {
  await jugar(c, 'beto', 1, 20);
  const codigo = (await pedir(c.base, 'GET', '/api/academia/competencia/1/certificados', { galleta: c.g.ana })).datos.certificados[0].codigo;
  const ruta = `/api/academia/competencia/1/certificados/${codigo}/comentario`;
  for (let k = 0; k < 2; k++) assert.equal((await pedir(c.base, 'POST', ruta, { galleta: c.g.ana, datos: { texto: `bravo ${k}` } })).codigo, 201);
  const r = await pedir(c.base, 'POST', ruta, { galleta: c.g.ana, datos: { texto: 'bravo 3' } });
  assert.deepEqual([r.codigo, r.datos.error], [429, 'demasiados_intentos']);
  // Otra persona sigue pudiendo.
  assert.equal((await pedir(c.base, 'POST', ruta, { galleta: c.g.carla, datos: { texto: 'bravo' } })).codigo, 201);
}, { limitesCompetencia: { comentar: new Limitador({ maximo: 2, ventanaMs: 600_000 }) } }));

test('«Mejorar preguntas con IA»: sin IA dice que no hay; la sugerencia solo cambia redacción y chistes, se aprueba, y nunca en una ronda ya jugada', () => conCompetencia(async c => {
  const sinIa = await pedir(c.base, 'POST', '/api/admin/academia/competencia/1/mejorar', { galleta: c.admin, datos: {} });
  assert.deepEqual([sinIa.codigo, sinIa.datos.error], [409, 'ia_no_disponible']);
  // Lo que «respondió la IA» (guardado como lo haría el trabajador): solo ids de la ronda y solo los campos permitidos.
  guardarSugerencia(c.db, { clave: 'academia.compe.sugerencia.1', ids: SEMILLA[1].preguntas.map(q => q.id) }, {
    cambios: [
      { id: 'r1-01', pregunta: '¿En qué año volaron los Wright con motor por primera vez?', explicacion: 'Fue en 1903.', bien: '¡Bien!', mal: 'Casi.', correcta: 'A', opciones: { A: 'x' } },
      { id: 'r9-99', pregunta: 'inventada', explicacion: 'x', bien: 'x', mal: 'x' },
      { id: 'r1-02', pregunta: 'mira https://ejemplo.com', explicacion: '', bien: '', mal: '' },
    ],
  });
  const adm = await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.admin });
  const s = adm.datos.rondas[0].sugerencia;
  assert.deepEqual(s.cambios.map(x => x.id), ['r1-01']);
  assert.equal(s.cambios[0].antes.pregunta, SEMILLA[1].preguntas[0].pregunta);
  assert.equal(s.cambios[0].correcta, undefined);
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/1/aprobar', { galleta: c.admin, datos: {} })).datos.aplicados, 1);
  const e = await pedir(c.base, 'POST', '/api/academia/competencia/1/empezar', { galleta: c.g.ana, datos: {} });
  assert.equal(e.datos.actual.pregunta, '¿En qué año volaron los Wright con motor por primera vez?');
  assert.deepEqual(e.datos.actual.opciones, SEMILLA[1].preguntas[0].opciones);
  // Ya alguien la empezó: ni pedir otra mejora ni aprobar.
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/1/mejorar', { galleta: c.admin, datos: {} })).datos.error, 'ronda_ya_jugada');
  guardarSugerencia(c.db, { clave: 'academia.compe.sugerencia.1', ids: ['r1-03'] }, { cambios: [{ id: 'r1-03', pregunta: 'otra', explicacion: 'otra cosa', bien: 'b', mal: 'm' }] });
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/1/aprobar', { galleta: c.admin, datos: {} })).datos.error, 'ronda_ya_jugada');
  // La ronda congelada no cambia aunque cambie lo aprobado después.
  guardarAjuste(c.db, 'academia.compe.cambios.1', JSON.stringify({ 'r1-01': { pregunta: 'cambiada a escondidas' } }));
  c.reloj.ahora += 1000;
  assert.equal((await pedir(c.base, 'GET', '/api/academia/competencia/1', { galleta: c.g.ana })).datos.actual.pregunta, '¿En qué año volaron los Wright con motor por primera vez?');
  assert.ok(CAMPOS_IA.every(k => ['pregunta', 'explicacion', 'bien', 'mal'].includes(k)));
}));

test('la frase de la IA para el certificado: corta, sin enlaces ni empresas; si no sirve, queda la fija', () => conCompetencia(async c => {
  await jugar(c, 'dario', 2, 5);
  const certs = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.g.dario })).datos.certificados;
  const clave = `academia.certificado.compe2.${c.ids.dario}`;
  assert.throws(() => guardarFrase(c.db, { clave }, { frase: 'Visita https://algo.com' }));
  assert.throws(() => guardarFrase(c.db, { clave }, { frase: 'Te lo dice Claude' }));
  assert.throws(() => guardarFrase(c.db, { clave: 'academia.otra.cosa' }, { frase: 'hola' }));
  assert.equal(limpiarFrase('«No me monto con ese piloto ni porque me paguen 😂»'), 'No me monto con ese piloto ni porque me paguen 😂');
  guardarFrase(c.db, { clave }, { frase: 'Con 5 de 20, el avión te pide que lo dejes en tierra 😂' });
  const despues = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.g.dario })).datos.certificados;
  assert.equal(despues[0].frase, 'Con 5 de 20, el avión te pide que lo dejes en tierra 😂');
  assert.equal(despues[0].codigo, certs[0].codigo);
  // Los pedidos nunca llevan el nombre del alumno y caben en su propósito.
  const f = armarFrase({ ronda: 2, titulo: 'Gigantes', aciertos: 5, total: 20, falladas: ['¿Cuántos motores…?'] });
  assert.ok(Buffer.byteLength(f.sistema) + Buffer.byteLength(f.texto) >= PROPOSITOS.compe_frase.entradaMinBytes);
  assert.ok(Buffer.byteLength(f.sistema) + Buffer.byteLength(f.texto) <= PROPOSITOS.compe_frase.entradaMaxBytes);
  assert.doesNotMatch(f.texto, /dario|Dario/i);
  for (const n of RONDAS) {
    const m = armarMejora({ ronda: n, titulo: SEMILLA[n].titulo, preguntas: SEMILLA[n].preguntas });
    const bytes = Buffer.byteLength(m.sistema) + Buffer.byteLength(m.texto);
    assert.ok(bytes >= PROPOSITOS.compe_mejorar.entradaMinBytes && bytes <= PROPOSITOS.compe_mejorar.entradaMaxBytes, `ronda ${n}: ${bytes}`);
  }
}));

test('el reloj es opcional: el administrador lo apaga (0) o lo cambia (20–120 s)', () => conCompetencia(async c => {
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/ajustes', { galleta: c.admin, datos: { reloj: 0 } })).datos.reloj, 0);
  assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/ajustes', { galleta: c.admin, datos: { reloj: 5 } })).codigo, 400);
  const e = await pedir(c.base, 'POST', '/api/academia/competencia/3/empezar', { galleta: c.g.ana, datos: {} });
  assert.equal(e.datos.actual.quedanMs, null);
  c.reloj.ahora += 10 * 60_000;
  const r = await pedir(c.base, 'POST', '/api/academia/competencia/3/responder', { galleta: c.g.ana, datos: { pregunta: e.datos.actual.id, elegida: SEMILLA[3].preguntas[0].correcta } });
  assert.deepEqual([r.datos.correcta, r.datos.aTiempo], [true, true]);
  // Se acabó el tiempo en la pantalla (elegida: null): cuenta como mala, sin errores.
  await pedir(c.base, 'GET', '/api/academia/competencia/3', { galleta: c.g.ana });
  const nada = await pedir(c.base, 'POST', '/api/academia/competencia/3/responder', { galleta: c.g.ana, datos: { pregunta: 'r3-02', elegida: null } });
  assert.deepEqual([nada.codigo, nada.datos.correcta], [200, false]);
}));
