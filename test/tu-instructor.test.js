// Academia 0.14.34: «Tu instructor» (#instructor: src/academia/profe-chat.js, src/api/instructor.js y
// public/instructor-vista.js), la «Recomendación de tu instructor» de Repaso y la lectura de la Biblioteca
// (estructura de public/biblioteca-vista.js). Con el proveedor FALSO o sin IA: determinista.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cambiosEstudio, charlaCambios, seguirCambios, fotoEstudio, vivoEstudio, CAMBIO_MINIMO } from '../src/academia/profe-chat.js';
import { diaDe } from '../src/academia/progreso.js';
import { guardarAjuste, leerAjuste } from '../src/academia/paquetes.js';
import { darProfesor } from '../src/academia/profesor.js';
import { estructura, esTituloMayusculas, letraGuardada, guardarLetra } from '../public/biblioteca-vista.js';
import { crearVistaInstructor, textoCambio, textoDebil, revision, textoRevision, contarPalabras, semillaDe, VARIANTES, MAX_PALABRAS } from '../public/instructor-vista.js';
import { crearPagos } from '../public/pagos.js';
import { crearInstructor } from '../public/instructor.js';
import { conInstructor, pedir, pedidosIa, cuerpoDe, sistemaDe, datosDe, DE, NOMBRES } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID_INTERNO = /factores_humanos|muestra-|oral_calificaciones|oral_rendimiento|t01-a|\bm\d{2}\b|\btg-\d/;
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const mal = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);
const HIPOXIA = ['muestra-h1', 'muestra-h2', 'muestra-h3', 'muestra-h4'];
const DIA = 86_400_000;
const sinIdsNiNombres = (datos, que) => {
  const s = JSON.stringify(datos);
  assert.doesNotMatch(s, ID_INTERNO, `${que}: sin ids internos`);
  for (const n of [...NOMBRES, 'junior']) assert.ok(!s.toLowerCase().includes(n), `${que}: sin el nombre ${n}`);
};
// Una práctica del instructor de Hipoxia respondida por la API: bien = cuántas acierta (las primeras).
async function practicar(c, galleta, bien) {
  const x = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos: { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
  for (const [i, q] of x.preguntas.entries()) {
    await pedir(c.base, 'POST', `/api/academia/intentos/${x.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: i < bien ? DE(q.id).original.correcta : mal(q.id) } });
  }
  await pedir(c.base, 'POST', `/api/academia/intentos/${x.id}/terminar`, { galleta, datos: {} });
  return x;
}

// ---------- Lo que cambió (puro) ----------
test('los cambios: mejoró, bajó y sigue flojo (con respuestas nuevas), lo igual no se dice y un título que ya no existe tampoco', () => {
  const titulo = k => ({ 'fh/hipoxia': 'Hipoxia', 'fh/vision': 'Visión nocturna', 'fh/espacio': 'Espacio aéreo', 'fh/igual': 'Igual', 'v:o/a': 'Licencias' }[k] ?? null);
  const antes = { 'fh/hipoxia': { bien: 2, de: 6 }, 'fh/vision': { bien: 5, de: 5 }, 'fh/espacio': { bien: 1, de: 4 }, 'fh/igual': { bien: 4, de: 4 }, 'fh/borrado': { bien: 0, de: 3 }, 'v:o/a': { pct: 30 } };
  const ahora = { 'fh/hipoxia': { bien: 5, de: 6 }, 'fh/vision': { bien: 5, de: 8 }, 'fh/espacio': { bien: 2, de: 6 }, 'fh/igual': { bien: 4, de: 4 }, 'fh/borrado': { bien: 3, de: 3 }, 'v:o/a': { pct: 90 }, 'fh/nuevo': { bien: 0, de: 2 } };
  const c = cambiosEstudio(antes, ahora, titulo);
  assert.deepEqual(c.map(x => [x.tipo, x.titulo, x.origen]), [['mejoro', 'Licencias', 'vivo'], ['mejoro', 'Hipoxia', 'tg'], ['bajo', 'Visión nocturna', 'tg']], 'hasta 3, lo que mejoró primero');
  assert.deepEqual(c[1].antes, { bien: 2, de: 6 });
  assert.deepEqual(c[1].ahora, { bien: 5, de: 6 });
  // Espacio aéreo: 25 % → 33 % (menos de CAMBIO_MINIMO) con respuestas nuevas: «sigue flojo».
  const solo = cambiosEstudio({ 'fh/espacio': antes['fh/espacio'], 'fh/igual': antes['fh/igual'] }, { 'fh/espacio': ahora['fh/espacio'], 'fh/igual': ahora['fh/igual'] }, titulo);
  assert.ok(33 - 25 < CAMBIO_MINIMO);
  assert.deepEqual(solo.map(x => [x.tipo, x.titulo]), [['sigue_flojo', 'Espacio aéreo']]);
  // Sin respuestas nuevas (la misma foto): nada que decir.
  assert.deepEqual(cambiosEstudio({ 'fh/espacio': { bien: 1, de: 4 } }, { 'fh/espacio': { bien: 1, de: 4 } }, titulo), []);
  assert.deepEqual(cambiosEstudio(null, ahora, titulo), []);
  // Lo que dice, como un profe: «mejoraste en Hipoxia… pero en Espacio aéreo todavía dudas».
  assert.deepEqual(charlaCambios([{ tipo: 'mejoro', titulo: 'Hipoxia' }, { tipo: 'sigue_flojo', titulo: 'Espacio aéreo' }], null).map(l => [l.clave, l.vars.tema]),
    [['profe.cambio.mejoro_pero', 'Hipoxia'], ['profe.cambio.flojo', 'Espacio aéreo']]);
  assert.deepEqual(charlaCambios([], { titulo: 'Visión' }).map(l => l.clave), ['profe.cambio.foco']);
  // El texto de la tarjeta.
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const t = (k, v = {}) => (es[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v[n]));
  assert.equal(textoCambio(c[1], t), 'Hipoxia: 2/6 → 5/6 ✅ mejoraste');
  assert.equal(textoCambio(solo[0], t), 'Todavía con dudas en Espacio aéreo');
  assert.equal(textoCambio(c[0], t), 'Licencias (oral en vivo): 30 % → 90 % ✅ mejoraste');
  assert.equal(textoDebil({ origen: 'vivo', titulo: 'Licencias', pct: 30 }, t), 'Licencias · oral en vivo 30 %');
});

test('la foto de cada día: se compara con el último día ANTERIOR, el mismo día no se mueve la referencia, y solo leer no guarda nada', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    const t0 = Date.parse('2026-11-10T15:00:00Z');
    const clave = `academia.instructor.foto.${z}`;
    assert.equal(seguirCambios(c.db, z, { 'a/b': { bien: 1, de: 4 } }, t0), null, 'la primera vez no hay con qué comparar');
    assert.equal(seguirCambios(c.db, z, { 'a/b': { bien: 2, de: 4 } }, t0 + 3600_000), null, 'el mismo día: todavía nada de antes');
    const base = seguirCambios(c.db, z, { 'a/b': { bien: 4, de: 4 } }, t0 + DIA);
    assert.deepEqual(base, { dia: diaDe(t0), temas: { 'a/b': { bien: 2, de: 4 } } }, 'al día siguiente: la última foto de ayer');
    assert.deepEqual(seguirCambios(c.db, z, { 'a/b': { bien: 4, de: 5 } }, t0 + DIA + 3600_000), base, 'el mismo día la referencia no se corre');
    const guardado = leerAjuste(c.db, clave);
    assert.deepEqual(seguirCambios(c.db, z, { 'a/b': { bien: 0, de: 9 } }, t0 + 5 * DIA, { soloLeer: true })?.dia, diaDe(t0 + DIA), 'solo leer: compara…');
    assert.equal(leerAjuste(c.db, clave), guardado, '…pero no guarda nada');
  }, { encender: false });
});

// ---------- La pantalla #instructor por la API ----------
test('«Tu instructor»: su tarjeta (débiles, cambios desde ayer, «Guíame»), sin ids ni nombres; el chat solo con su permiso y con IA', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    // Ayer le iba mal en Hipoxia (0/4): la foto de ayer, como la habría guardado la tarjeta.
    const ayer = diaDe(Date.now() - DIA);
    guardarAjuste(c.db, `academia.instructor.foto.${z}`, JSON.stringify({ base: null, ultima: { dia: ayer, temas: { 'factores_humanos/muestra-hipoxia': { bien: 0, de: 4 } } } }));
    await practicar(c, c.z, 3);
    const r = await pedir(c.base, 'GET', '/api/academia/instructor/resumen', { galleta: c.z });
    assert.equal(r.codigo, 200);
    const d = r.datos;
    assert.equal(d.hay, true);
    assert.equal(d.chat, false, 'sin el Profesor (no lo pagó ni se lo dieron): sin caja para escribir');
    assert.equal(d.cambios[0].tipo, 'mejoro');
    assert.equal(d.cambios[0].titulo, 'La hipoxia (muestra)');
    assert.deepEqual(d.cambios[0].antes, { bien: 0, de: 4 });
    assert.ok(!('clave' in d.cambios[0]), 'la clave interna no sale');
    assert.equal(d.desdeDias, 1);
    assert.equal(d.charla[0].clave, 'profe.cambio.mejoro');
    assert.equal(d.algo, true, 'el puntito «Tu instructor tiene algo para ti»');
    sinIdsNiNombres({ cambios: d.cambios, charla: d.charla, debiles: d.debiles, lineas: d.lineas, vivo: d.vivo, repasoFinal: d.repasoFinal }, 'la tarjeta');
    // «Guíame» sin IA: las tarjetas «Otra vez, más fácil» (o la clase) del tema abierto; un tema cerrado no.
    const g = await pedir(c.base, 'GET', '/api/academia/instructor/guia/factores_humanos/muestra-hipoxia', { galleta: c.z });
    assert.equal(g.codigo, 200);
    assert.ok(g.datos.facil.length > 0 && g.datos.facil.every(x => typeof x.texto === 'string'));
    assert.equal(g.datos.ia, false);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor/guia/factores_humanos/muestra-ilusiones', { galleta: c.z })).codigo, 403);
    // Con el Profesor y con IA: el chat.
    darProfesor(c.db, z, true);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor/resumen', { galleta: c.z })).datos.chat, true);
    // «Guíame» en el chat: a la IA le llega que lo explique con OTRAS palabras, y su historia con lo que cambió.
    c.falso.siguiente({ tipo: 'ok', json: { respuesta: 'Piénsalo como subir una montaña: hay menos aire.', pregunta_control: '¿Qué baja?', estudiar_ahora: 'La hipoxia', buscar_en_youtube: [], terminos: [], cita_test_guide: [] } });
    const x = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: 'Guíame en La hipoxia', materia: 'factores_humanos', tema: 'muestra-hipoxia', guia: true } })).datos;
    assert.equal(x.ia.estado, 'pendiente');
    await c.hacer(x.ia.tarea);
    const cuerpo = cuerpoDe(pedidosIa(c).at(-1));
    assert.match(sistemaDe(cuerpo), /Modo GUÍAME/);
    const estudio = datosDe(cuerpo.messages[0].content).estudio;
    assert.equal(estudio.cambios_desde_antes[0].que_paso, 'mejoro');
    assert.equal(estudio.cambios_desde_antes[0].tema, 'La hipoxia (muestra)');
    sinIdsNiNombres(estudio, 'lo que va a la IA');
    // Las preguntas rápidas: una práctica de verdad con «cuantas» (2–10), guardada como práctica.
    const q = await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.z, datos: { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-hipoxia', cuantas: 3 } });
    assert.equal(q.codigo, 201);
    assert.ok(q.datos.total <= 3);
    assert.equal(q.datos.tipo, 'instructor');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.z, datos: { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-hipoxia', cuantas: 1 } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.z, datos: { tipo: 'instructor', cuantas: 'x' } })).codigo, 400);
  });
});

test('sin IA: la tarjeta y sus botones, sin chat (aunque tenga el Profesor), sin llamar a nadie', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    darProfesor(c.db, z, true);
    await practicar(c, c.z, 0);
    const antes = pedidosIa(c).length;
    const d = (await pedir(c.base, 'GET', '/api/academia/instructor/resumen', { galleta: c.z })).datos;
    assert.equal(d.chat, false);
    assert.equal(d.ia, false);
    assert.ok(d.botones.length > 0);
    assert.ok(d.debiles.some(x => x.origen === 'tg' && x.titulo === 'La hipoxia (muestra)'));
    assert.equal(d.foco?.titulo, 'La hipoxia (muestra)', 'el tema para «Estudiar por mi cuenta» / «Guíame»');
    assert.ok(d.repaso.n > 0, 'lo fallado entra al repaso');
    assert.equal(pedidosIa(c).length, antes);
    // «Repaso con tu instructor»: el repaso de siempre (con «cuantas»); acertar sube la caja del repaso.
    const r = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.z, datos: { tipo: 'repaso', cuantas: 2 } })).datos;
    assert.equal(r.total, 2);
    const p0 = r.preguntas[0];
    await pedir(c.base, 'POST', `/api/academia/intentos/${r.id}/responder`, { galleta: c.z, datos: { pregunta: p0.id, elegida: DE(p0.id).original.correcta } });
    assert.equal(c.db.prepare('SELECT caja FROM academia_repaso WHERE usuario_id = ? AND pregunta = ?').get(z, p0.id).caja, 2, 'quedó al día con la lógica del repaso');
  }, { encender: false });
});

test('el administrador: su propio instructor completo (chat con su permiso de admin) y, solo para ver, lo que le recomienda a un alumno', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    await practicar(c, c.admin, 1);
    const yo = (await pedir(c.base, 'GET', '/api/academia/instructor/resumen', { galleta: c.admin })).datos;
    assert.equal(yo.permitido, true, 'el administrador siempre tiene permiso');
    assert.equal(yo.chat, true);
    assert.ok(yo.debiles.length > 0, 'con su propia historia');
    await practicar(c, c.z, 0);
    const clave = `academia.instructor.foto.${z}`;
    const antes = leerAjuste(c.db, clave);
    const r = await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${z}/instructor`, { galleta: c.admin });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.soloLeer, true);
    assert.equal(r.datos.foco.titulo, 'La hipoxia (muestra)');
    assert.equal(leerAjuste(c.db, clave), antes, 'mirar no cambia nada del alumno');
    sinIdsNiNombres({ cambios: r.datos.cambios, charla: r.datos.charla, debiles: r.datos.debiles }, 'la vista del administrador');
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${z}/instructor`, { galleta: c.q })).codigo, 403, 'un alumno no ve la de otro');
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/alumnos/999999/instructor', { galleta: c.admin })).codigo, 404);
  });
});

test('la práctica en vivo del oral entra en la tarjeta y en lo que lee la IA, con títulos y sin ids', async () => {
  await conInstructor(async c => {
    const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paqueteOralMuestra()) });
    for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} });
    const z = idDe(c, 'zoelia');
    darProfesor(c.db, z, true);
    guardarAjuste(c.db, `academia.oral.vivo.${z}`, JSON.stringify({ veces: 2, mejor: 60, aprobado: false, historial: [
      { pct: 60, aprobado: false, listo: false, temas: { 'oral_calificaciones/t01-a': { pct: 80 }, 'oral_rendimiento/t01-a': { pct: 90 } } },
      { pct: 40, aprobado: false, listo: false, temas: { 'oral_calificaciones/t01-a': { pct: 20 }, 'oral_x/inventado': { pct: 0 } } }] }));
    const d = (await pedir(c.base, 'GET', '/api/academia/instructor/resumen', { galleta: c.z })).datos;
    assert.deepEqual(d.vivo, { veces: 2, ultima: 40, mejor: 60, listo: false });
    const flojo = d.debiles.find(x => x.origen === 'vivo');
    assert.ok(flojo && flojo.pct === 20, 'vale la ÚLTIMA vez que salió ese tema');
    assert.ok(d.botones.some(b => b.tipo === 'oral'), 'un botón al oral');
    sinIdsNiNombres({ debiles: d.debiles, vivo: d.vivo }, 'la tarjeta con el oral');
    c.falso.siguiente({ tipo: 'ok', json: { respuesta: 'Dale al oral.', pregunta_control: '¿?', estudiar_ahora: 'oral', buscar_en_youtube: [], terminos: [], cita_test_guide: [] } });
    const x = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Cómo voy en el oral?' } })).datos;
    await c.hacer(x.ia.tarea);
    const estudio = datosDe(cuerpoDe(pedidosIa(c).at(-1)).messages[0].content).estudio;
    assert.equal(estudio.oral_en_vivo.ultima_pct, 40);
    assert.equal(estudio.oral_en_vivo.temas_flojos[0].tema, flojo.titulo);
    sinIdsNiNombres(estudio, 'lo que va a la IA (oral en vivo)');
    // vivoEstudio solo: nada si nunca practicó.
    assert.equal(vivoEstudio({ veces: 0 }, null), null);
  });
});

// ---------- «Recomendación de tu instructor» (Repaso) ----------
test('la recomendación de Repaso: la misma mientras no cambian sus resultados, y cambia (con lo que mejoró) cuando cambian', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    const clave = `academia.instructor.reco.${z}`;
    await practicar(c, c.z, 0);
    const a = (await pedir(c.base, 'GET', '/api/academia/instructor/recomendacion', { galleta: c.z })).datos;
    assert.equal(a.lineas[0].clave, 'tuinstr.reco.foco');
    assert.equal(a.lineas[0].vars.tema, 'La hipoxia (muestra)');
    assert.deepEqual(a.botones.map(b => b.tipo), ['practicar', 'clase']);
    const b = (await pedir(c.base, 'GET', '/api/academia/instructor/recomendacion', { galleta: c.z })).datos;
    assert.deepEqual(b, a, 'la misma, sin volver a armarla');
    assert.equal(JSON.parse(leerAjuste(c.db, clave)).veces, 1);
    // Mejora en Hipoxia: la recomendación cambia y lo celebra.
    await practicar(c, c.z, 4);
    const d = (await pedir(c.base, 'GET', '/api/academia/instructor/recomendacion', { galleta: c.z })).datos;
    assert.equal(JSON.parse(leerAjuste(c.db, clave)).veces, 2);
    assert.match(d.lineas[0].clave, /^tuinstr\.reco\.mejoro/);
    assert.equal(d.lineas[0].vars.bien, 'La hipoxia (muestra)');
    sinIdsNiNombres(d.lineas, 'la recomendación (los botones llevan su destino, como siempre)');
    const fotoAntes = JSON.stringify(fotoEstudio({ materias: [] }));
    assert.equal(fotoAntes, '{}');
  }, { encender: false });
});

// ---------- La pantalla (un DOM de mentira) ----------
class Nodo {
  constructor(etiqueta) { this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.isConnected = true; this.classList = { add() {}, remove() {}, toggle() {} }; }
  append(...xs) { for (const x of xs) if (x != null) this.hijos.push(x instanceof Nodo ? x : String(x)); }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
  todos(f, out = []) { if (f(this)) out.push(this); for (const h of this.hijos) if (h instanceof Nodo) h.todos(f, out); return out; }
}
function ayudas(extra = {}) {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const t = (clave, vars = {}) => (es[clave] ?? clave).replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`));
  const tn = (clave, vars = {}) => (Number(vars.n) === 1 && es[`${clave}.uno`] ? t(`${clave}.uno`, vars) : t(clave, vars));
  const el = (etiqueta, props = {}, ...hijos) => {
    const n = new Nodo(etiqueta);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false || k.startsWith('on')) continue;
      if (k === 'texto') n.textContent = v; else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) if (h != null && h !== false) n.append(h);
    return n;
  };
  const talCual = (etiqueta, texto, clase = '') => el(etiqueta, { class: `tal-cual ${clase}`.trim(), texto: texto ?? '' });
  const base = { el, t, tn, talCual, numero: n => String(n), icono: () => el('svg'), nombreMateria: id => id, sonar: () => {}, empezarIntento: () => {}, textoError: x => x, avisar: () => {}, api: async () => ({ ok: false, datos: {} }), partirTitulo: s => ({ es: String(s) }) };
  const ins = crearInstructor(base);
  return { ...base, instructorUi: () => ins, programar: () => 0, parar: () => {}, ...extra };
}
const RESUMEN = {
  hay: true, chat: false, ia: false, algo: true, desdeDias: 1,
  charla: [{ clave: 'profe.cambio.mejoro_pero', vars: { tema: 'La hipoxia' } }, { clave: 'profe.cambio.flojo', vars: { tema: 'Espacio aéreo' } }],
  lineas: [], cambios: [{ tipo: 'mejoro', origen: 'tg', titulo: 'La hipoxia', antes: { bien: 2, de: 6 }, ahora: { bien: 5, de: 6 } }, { tipo: 'sigue_flojo', origen: 'tg', titulo: 'Espacio aéreo', antes: { bien: 1, de: 4 }, ahora: { bien: 2, de: 6 } }],
  debiles: [{ origen: 'tg', titulo: 'Espacio aéreo', pct: 33 }, { origen: 'vivo', titulo: 'Licencias', pct: 20 }],
  foco: { materia: 'reglamento', tema: 'espacio', titulo: 'Espacio aéreo' },
  botones: [{ tipo: 'oral', materia: 'oral_x', tema: 'a', titulo: 'Licencias' }], repaso: { n: 3 }, vivo: { veces: 2, ultima: 40, mejor: 60, listo: false }, repasoFinal: null,
};

// Los botones a la vista de un mensaje (las pastillas de arriba, sin «Más opciones» ni lo plegado).
const pastillasVisibles = nodo => nodo.todos(n => n.etiqueta !== 'svg' && /(^|\s)pastillas(\s|$)/.test(n.atributos.class ?? ''))
  .flatMap(p => p.hijos.filter(x => typeof x !== 'string' && /\bpastilla\b/.test(x.atributos.class ?? '') && !/\bmas\b/.test(x.atributos.class ?? '')));
const textoDe = n => n.textContent.replace(/\s+/g, ' ');

test('la revisión (el primer mensaje): corta, humana, con frases variadas y los hechos del código; nunca una lista de «Sigues flojo»', () => {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
  const { t, tn } = ayudas();
  const d = {
    cambios: [{ tipo: 'mejoro', origen: 'tg', titulo: 'Visión nocturna', antes: { bien: 1, de: 4 }, ahora: { bien: 4, de: 4 } },
      { tipo: 'sigue_flojo', origen: 'tg', titulo: 'Experiencia reciente', antes: { bien: 0, de: 2 }, ahora: { bien: 1, de: 4 } },
      { tipo: 'sigue_flojo', origen: 'tg', titulo: 'Desorientación espacial', antes: { bien: 0, de: 2 }, ahora: { bien: 1, de: 5 } }],
    debiles: [{ origen: 'tg', titulo: 'Experiencia reciente', pct: 25, bien: 1, de: 4 }, { origen: 'tg', titulo: 'Desorientación espacial', pct: 20, bien: 1, de: 5 }, { origen: 'vivo', titulo: 'Licencias', pct: 6 }],
    foco: { materia: 'reglamento', tema: 'reciente', titulo: 'Experiencia reciente' }, desdeDias: 1, repaso: { n: 4 },
    botones: [{ tipo: 'oral', materia: 'oral_x', tema: 'a', titulo: 'Licencias' }, { tipo: 'examen', materia: 'reglamento' }], vivo: { ultima: 6, mejor: 6 },
  };
  const r = revision(d, { semilla: 0 });
  const texto = textoRevision(r, t, tn);
  assert.equal(texto, 'Revisé tu estudio de ayer y hoy. 👍 Vas bien en Visión nocturna. Donde te veo con dudas: Experiencia reciente (1 de 4) y Desorientación espacial. ¿Empezamos por Experiencia reciente? Te tomo 3 preguntas rápidas.');
  assert.doesNotMatch(texto, /Sigues flojo|%/, 'sin la lista mecánica ni porcentajes sueltos');
  assert.ok(contarPalabras(texto) <= MAX_PALABRAS, `${contarPalabras(texto)} palabras`);
  // Hasta 3 acciones a la vista (la principal: «Repasar ahora»), lo demás en «Más opciones».
  assert.deepEqual(r.acciones.primarias.map(a => a.etiqueta), ['tuinstr.accion.repasar', 'tuinstr.accion.clase', 'tuinstr.accion.oral']);
  assert.ok(r.acciones.mas.some(a => a.tipo === 'repaso_guiado') && r.acciones.mas.some(a => a.tipo === 'practicar') && r.acciones.mas.some(a => a.tipo === 'examen'));
  // Otro día, otras palabras (los mismos hechos); el mismo día, siempre las mismas.
  const textos = new Set([0, 1, 2].map(s => textoRevision(revision(d, { semilla: s }), t, tn)));
  assert.equal(textos.size, 3);
  assert.equal(textoRevision(revision(d, { semilla: 5 }), t, tn), textoRevision(revision(d, { semilla: 5 }), t, tn));
  assert.equal(semillaDe(Date.UTC(2026, 10, 18, 3)), semillaDe(Date.UTC(2026, 10, 17, 5)), 'antes de las 4 a. m. UTC sigue siendo el día de Santo Domingo');
  for (let s = 0; s < 6; s++) {
    const x = textoRevision(revision(d, { semilla: s }), t, tn);
    for (const hecho of ['Visión nocturna', 'Experiencia reciente', 'Desorientación espacial']) assert.ok(x.includes(hecho), `${s}: ${hecho}`);
    assert.ok(contarPalabras(x) <= MAX_PALABRAS, x);
  }
  // Sin foco: el repaso; sin nada flojo: la próxima clase; sin nada: una invitación a empezar.
  assert.match(textoRevision(revision({ repaso: { n: 1 }, debiles: [], cambios: [] }), t, tn), /1 pregunta de repaso para hoy/);
  assert.deepEqual(revision({ repaso: { n: 2 } }).acciones.primarias.map(a => a.tipo), ['repaso_guiado']);
  const tranquilo = revision({ cambios: [], debiles: [], botones: [{ tipo: 'clase', materia: 'm', tema: 't', titulo: 'La próxima' }] });
  assert.match(textoRevision(tranquilo, t, tn), /No veo nada flojo.*próxima clase/);
  assert.deepEqual(tranquilo.acciones.primarias.map(a => a.etiqueta), ['tuinstr.accion.siguiente']);
  assert.equal(textoRevision(revision({}), t, tn), es['tuinstr.rev.vacio']);
  // Mejoró pero sigue flojo (y es el tema para empezar): no dice «vas bien» a secas ni repite el tema.
  const subio = textoRevision(revision({ cambios: [{ tipo: 'mejoro', origen: 'tg', titulo: 'Hipoxia' }], debiles: [{ origen: 'tg', titulo: 'Hipoxia', bien: 1, de: 3 }], foco: { materia: 'm', tema: 't', titulo: 'Hipoxia' } }), t, tn);
  assert.equal(subio, 'Revisé tu estudio de ayer y hoy. 👍 Mejoraste en Hipoxia, aunque todavía no está firme. ¿Le damos una vuelta más? Te tomo 3 preguntas rápidas.');
  // El oral en vivo se nombra como «(oral)», sin su porcentaje.
  assert.match(textoRevision(revision({ debiles: [{ origen: 'vivo', titulo: 'Licencias', pct: 6 }] }), t, tn), /Licencias \(oral\)/);
  // Títulos largos: sigue corto.
  const largo = 'Un título de tema bastante largo para la prueba';
  const x = textoRevision(revision({ ...d, cambios: [{ ...d.cambios[0], titulo: largo }], foco: { ...d.foco, titulo: `${largo} 2` }, debiles: [{ origen: 'tg', titulo: `${largo} 3`, bien: 1, de: 4 }] }), t, tn);
  assert.ok(contarPalabras(x) <= MAX_PALABRAS, x);
  const muyLargo = 'Un título de tema larguísimo con muchas palabras para ver que nunca pasa de sesenta en total';
  const y = textoRevision(revision({ ...d, cambios: [{ ...d.cambios[0], titulo: `${muyLargo} 1` }], foco: { ...d.foco, titulo: `${muyLargo} 2` }, debiles: [{ origen: 'tg', titulo: `${muyLargo} 3`, bien: 1, de: 4 }] }), t, tn);
  assert.ok(contarPalabras(y) <= MAX_PALABRAS, `${contarPalabras(y)}: ${y}`);
  // Los títulos, sin el inglés entre paréntesis; un «mejoró» que sigue bajo 70 % no es «vas bien»; el oral, con «(oral)».
  assert.match(textoRevision(revision({ foco: { materia: 'm', tema: 't', titulo: 'Hipoxia (Hypoxia)' } }), t, tn), /por Hipoxia\?/);
  assert.match(textoRevision(revision({ cambios: [{ tipo: 'mejoro', origen: 'tg', titulo: 'Nubes', ahora: { bien: 2, de: 5 } }] }), t, tn), /Mejoraste en Nubes, aunque todavía no está firme/);
  assert.match(textoRevision(revision({ cambios: [{ tipo: 'mejoro', origen: 'vivo', titulo: 'Licencias', ahora: { pct: 90 } }] }), t, tn), /Vas bien en Licencias \(oral\)/);
  // Todas sus frases, en los dos idiomas.
  for (const [parte, n] of Object.entries(VARIANTES)) for (let i = 1; i <= n; i++) assert.ok(es[`tuinstr.rev.${parte}.${i}`] && en[`tuinstr.rev.${parte}.${i}`], `${parte}.${i}`);
  for (const k of ['tuinstr.rev.vacio', 'tuinstr.rev.en_oral', 'tuinstr.rev.fraccion', 'tuinstr.rev.y', 'tuinstr.mas']) assert.ok(es[k] && en[k], k);
});

test('la pantalla #instructor: un chat (cabeza, su revisión como primer mensaje, ≤ 3 pastillas); sin chat, SIN caja para escribir; con chat, la caja abajo', () => {
  let mostrado = null;
  let marcado = null;
  let chat = null;
  const h = ayudas({
    mostrar: x => { mostrado = x; }, marco: (seccion, ...xs) => { marcado = seccion; const n = new Nodo('div'); n.append(...xs.flat()); return n; },
    pagosUi: () => ({ pantallaProfesor: (prof, o) => { chat = { prof, o }; } }),
  });
  const v = crearVistaInstructor(h);
  v.pantalla({ ok: true, datos: RESUMEN }, { ok: true, datos: { permiso: { permitido: false }, historial: [] } });
  assert.equal(marcado, 'instructor');
  const texto = textoDe(mostrado);
  for (const x of ['Tu instructor', 'La hipoxia', 'Espacio aéreo', 'Repasar ahora', 'Ver la clase', 'Practicar oral', 'Más opciones', 'Estudiar por mi cuenta']) assert.ok(texto.includes(x), `falta «${x}»`);
  assert.doesNotMatch(texto, /Sigues flojo|Lo que más te cuesta|Desde ayer:|Test Guide 33|oral en vivo 20/, 'nada de la lista de antes');
  const primero = mostrado.todos(n => /tuinstr-primero/.test(n.atributos.class ?? ''));
  assert.equal(primero.length, 1, 'la revisión es UN mensaje del instructor');
  assert.match(primero[0].atributos.class, /burbuja profesor/);
  assert.ok(contarPalabras(primero[0].todos(n => /tuinstr-revision/.test(n.atributos.class ?? ''))[0].textContent) <= MAX_PALABRAS);
  const visibles = pastillasVisibles(primero[0]);
  assert.ok(visibles.length >= 1 && visibles.length <= 3, `${visibles.length} pastillas a la vista`);
  assert.ok(mostrado.todos(n => n.etiqueta === 'h1' && n.textContent.includes('Tu instructor')).length === 1, 'la cabeza del chat');
  assert.equal(mostrado.todos(n => n.etiqueta === 'textarea').length, 0, 'sin caja para escribir');
  assert.ok(texto.includes('hace falta el instructor con IA'));
  assert.doesNotMatch(texto, /reglamento|espacio\b|oral_x/, 'ningún id a la vista');
  assert.equal(chat, null);
  // Con chat: el chat del Profesor en modo mensajería, con la revisión como primer mensaje y las sugerencias.
  const conChat = { ok: true, datos: { permiso: { permitido: true }, historial: [] } };
  v.pantalla({ ok: true, datos: { ...RESUMEN, chat: true, ia: true } }, conChat);
  assert.equal(chat.o.seccion, 'instructor');
  assert.ok(chat.o.mensajero.primero.textContent.includes('Repasar ahora'));
  assert.ok(chat.o.mensajero.cabeza.textContent.includes('Tu instructor'));
  assert.deepEqual(chat.o.mensajero.chips.slice(0, 1), ['Explícame Espacio aéreo']);
  // La vista del administrador: solo leer (sin botones), con el detalle plegado.
  const t = v.tarjeta(RESUMEN);
  assert.ok(t.textContent.includes('Lo que le recomienda su instructor'));
  assert.ok(t.textContent.includes('Ver el detalle') && t.textContent.includes('La hipoxia: 2/6 → 5/6 ✅ mejoraste'));
  assert.ok(!t.textContent.includes('Repasar ahora') && !t.textContent.includes('Guíame') && !t.textContent.includes('Repaso con tu instructor'));
  assert.equal(t.todos(n => /\bpastilla\b/.test(n.atributos.class ?? '')).length, 0);
});

test('el chat estilo mensajería (pagos.js): caja para escribir abajo, respuestas cortas con «Ver más», «Comprueba» como quiz, ≤ 3 pastillas y un solo video', () => {
  let mostrado = null;
  const base = ayudas();
  const pagos = crearPagos({ ...base, fecha: x => String(x), confirmar: async () => true, cabeceraAdmin: () => null,
    mostrar: x => { mostrado = x; }, marco: (seccion, ...xs) => { const n = new Nodo('div'); n.atributos.seccion = seccion; n.append(...xs.flat()); return n; } });
  const largo = `${'La hipoxia aparece cuando entra menos oxígeno. '.repeat(10)}Por eso arriba se nota antes.`;
  const botones = [{ tipo: 'clase', materia: 'fh', tema: 'h', titulo: 'Hipoxia' }, { tipo: 'practicar', materia: 'fh', tema: 'h', titulo: 'Hipoxia' }, { tipo: 'test', materia: 'fh', tema: 'h', titulo: 'Hipoxia' }, { tipo: 'examen', materia: 'fh' }];
  const prof = { ok: true, datos: { permiso: { permitido: true }, tiempo: null, profe: { lineas: [{ clave: 'profe.bien', vars: {} }], botones }, historial: [
    { pregunta: '¿Qué es la hipoxia?', estado: 'lista', respuesta: { respuesta: largo, control: '¿Qué baja con la altura?', estudiar: 'La hipoxia' }, profe: { botones },
      videos: [{ url: 'https://www.youtube.com/watch?v=x', titulo: 'Hipoxia en vuelo' }], buscar: [{ url: 'https://www.youtube.com/results?search_query=a', texto: 'a' }, { url: 'https://www.youtube.com/results?search_query=b', texto: 'b' }] }] } };
  const primero = new Nodo('div');
  primero.textContent = 'Revisé tu estudio';
  const cabeza = new Nodo('header');
  pagos.pantallaProfesor(prof, { seccion: 'instructor', mensajero: { cabeza, primero, chips: ['Explícame la hipoxia', '¿Qué estudio hoy?'] } });
  assert.equal(mostrado.atributos.seccion, 'instructor');
  const texto = textoDe(mostrado);
  // La caja para escribir, con su botón de enviar y las sugerencias rápidas.
  const caja = mostrado.todos(n => n.etiqueta === 'textarea');
  assert.equal(caja.length, 1);
  assert.equal(caja[0].atributos.placeholder, 'Escríbele a tu instructor…');
  assert.equal(mostrado.todos(n => /chat-enviar/.test(n.atributos.class ?? '')).length, 1);
  assert.ok(texto.includes('Explícame la hipoxia') && texto.includes('Cada mensaje usa un minuto'));
  // Sin el resumen de antes; lo de antes, plegado; y la revisión, después.
  assert.equal(mostrado.todos(n => /profe-resumen/.test(n.atributos.class ?? '')).length, 0);
  assert.ok(texto.includes('Tus mensajes anteriores (1)'));
  const lista = mostrado.todos(n => n.atributos.class === 'chat-lista')[0];
  assert.equal(lista.hijos.at(-1), primero, 'la revisión va al final de la conversación (la última que se ve)');
  // La respuesta larga: lo primero y «Ver más»; «Comprueba» como quiz con su respuesta ahí mismo.
  assert.ok(texto.includes('Ver más'));
  assert.equal(mostrado.todos(n => n.atributos.class === 'burbuja-mas' && 'hidden' in n.atributos).length, 1);
  const quiz = mostrado.todos(n => /burbuja-quiz/.test(n.atributos.class ?? ''));
  assert.equal(quiz.length, 1);
  assert.ok(quiz[0].textContent.includes('Comprueba') && quiz[0].textContent.includes('¿Qué baja con la altura?'));
  assert.equal(quiz[0].todos(n => n.etiqueta === 'input').length, 0, 'en lo de antes, «Comprueba» se lee pero ya no se contesta');
  // Un solo video; nada de «Buscar en YouTube» repetido.
  assert.equal(mostrado.todos(n => /video-recomendado/.test(n.atributos.class ?? '')).length, 1);
  assert.doesNotMatch(texto, /Buscar en YouTube/);
  // Hasta 3 pastillas a la vista y «Más opciones»; ningún botón en MAYÚSCULAS (boton-3d) en la respuesta.
  const respuesta = mostrado.todos(n => n.atributos.class === 'burbuja profesor')[0];
  assert.ok(pastillasVisibles(respuesta).length <= 3);
  assert.ok(respuesta.textContent.includes('Más opciones'));
  assert.equal(respuesta.todos(n => /boton-3d/.test(n.atributos.class ?? '')).length, 0);
  // El chat de siempre (#profesor) no cambia: su resumen y su botón «Enviar».
  pagos.pantallaProfesor({ ok: true, datos: { ...prof.datos, historial: [] } });
  assert.equal(mostrado.todos(n => /profe-resumen/.test(n.atributos.class ?? '')).length, 1);
  assert.equal(mostrado.todos(n => n.etiqueta === 'textarea')[0].atributos.placeholder, 'Escribe tu pregunta…');
});

test('la ruta #instructor, el botón flotante (con su puntito) solo en Camino, Oral, Progreso y Repaso, y la recomendación arriba de Repaso', () => {
  const app = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');
  assert.match(app, /if \(seccion === 'instructor'\) return pantallaInstructor\(\);/);
  // 0.14.54: se mira la dirección de verdad (public/navegacion.js: rutaConInstructor), no la pestaña marcada en el menú.
  assert.match(readFileSync(join(RAIZ, 'public/navegacion.js'), 'utf8'), /const RUTAS_INSTRUCTOR = new Set\(\['', 'inicio', 'oral', 'progreso', 'repaso'\]\);/);
  assert.match(app, /const flotante = botonInstructor\(\);/, 'en marco() (nunca en marcoEstudio: ni en una clase ni en un examen)');
  assert.match(app, /pie\(\)\),\n    flotante\);\n\}/);
  assert.doesNotMatch(/function marcoEstudio[\s\S]*?\n\}/.exec(app)[0], /botonInstructor/);
  assert.match(readFileSync(join(RAIZ, 'public/repaso-final-vista.js'), 'utf8'), /h\.recoInstructor\?\.\(\)/);
  const vista = readFileSync(join(RAIZ, 'public/instructor-vista.js'), 'utf8');
  assert.doesNotMatch(vista, /innerHTML|style=|\.style\./);
  assert.doesNotMatch(readFileSync(join(RAIZ, 'public/pagos.js'), 'utf8'), /innerHTML|style=|\.style\./);
});

// ---------- La Biblioteca: leer cómodo ----------
test('la Biblioteca: títulos en MAYÚSCULAS y numerados, párrafos juntados, listas, etiquetas en negrita y la letra recordada', () => {
  const muestra = [
    'CAPÍTULO 2', 'REGLAS GENERALES DE MUESTRA', '2.1 Aplicación de la muestra',
    'Artículo 12.- El piloto de muestra será', 'responsable de que la opera-', 'ción cumpla estas reglas.', '',
    'Las condiciones son:', 'a) visibilidad de 5 km;', 'b) distancia de las nubes de', '1 500 m en horizontal;',
    '- un punto suelto', '• otro punto', '17', 'Sección 4', 'Texto final de la muestra.',
  ].join('\n');
  const b = estructura(muestra);
  assert.deepEqual(b.map(x => x.tipo), ['titulo', 'titulo', 'titulo', 'parrafo', 'parrafo', 'lista', 'lista', 'titulo', 'parrafo']);
  assert.deepEqual(b.slice(0, 3).map(x => x.nivel), [2, 2, 3]);
  assert.deepEqual([b[3].etiqueta, b[3].texto], ['Artículo 12.-', 'El piloto de muestra será responsable de que la operación cumpla estas reglas.']);
  assert.equal(b[4].texto, 'Las condiciones son:', 'una lista corta el párrafo aunque no haya renglón en blanco');
  assert.deepEqual(b[5], { tipo: 'lista', ordenada: true, items: [{ marca: 'a)', texto: 'visibilidad de 5 km;' }, { marca: 'b)', texto: 'distancia de las nubes de 1 500 m en horizontal;' }] });
  assert.deepEqual(b[6].items.map(x => x.texto), ['un punto suelto', 'otro punto']);
  assert.equal(b[7].texto, 'Sección 4');
  assert.ok(!JSON.stringify(b).includes('"17"'), 'el número de página suelto no se muestra');
  // Una oración en mayúsculas iniciales NO es título; un renglón numerado largo que termina en punto es párrafo.
  assert.equal(esTituloMayusculas('El piloto de muestra'), false);
  assert.equal(esTituloMayusculas('AB'), false);
  assert.equal(estructura('3.2 El piloto deberá llevar su licencia de muestra a bordo.')[0].tipo, 'parrafo');
  // Sin estructura: lo de antes (párrafos).
  assert.deepEqual(estructura('Uno dos\ntres al-\ntura\n\n Otro párrafo \n').map(x => x.texto), ['Uno dos tres altura', 'Otro párrafo']);
  // A− / A+: recordado (y sin almacenamiento, el tamaño normal sin romperse).
  const almacen = new Map();
  const a = { getItem: k => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, v) };
  assert.equal(letraGuardada(a), 2);
  assert.equal(guardarLetra(4, a), 4);
  assert.equal(letraGuardada(a), 4);
  assert.equal(guardarLetra(99, a), 5);
  const roto = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(letraGuardada(roto), 2);
  assert.equal(guardarLetra(3, roto), 3);
  const vista = readFileSync(join(RAIZ, 'public/biblioteca-vista.js'), 'utf8');
  assert.doesNotMatch(vista, /innerHTML|style=|\.style\./);
  assert.doesNotMatch(readFileSync(join(RAIZ, 'public/pagos.js'), 'utf8'), /innerHTML|style=|\.style\./);
});
