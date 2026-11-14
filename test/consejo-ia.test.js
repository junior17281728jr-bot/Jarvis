// Academia 0.14.15: el consejo del instructor IA, corto y con botones (src/academia/consejo-ia.js, la parte del consejo de
// src/academia/instructor-ia.js y pintarConsejo de public/instructor.js). Todo con el proveedor FALSO o sin IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decidirAlcance, elegirVideo, consejoParaVer } from '../src/academia/consejo-ia.js';
import { ESQUEMA_CONSEJO, PALABRAS_CONSEJO, armarConsejo, revisarRespuesta, cortarPalabras, esquemaDe } from '../src/academia/instructor-ia.js';
import { cumpleEsquema } from '../src/ia/esquema.js';
import { crearInstructor } from '../public/instructor.js';
import { conInstructor, unaMala, pedir, pedidosIa, textoDe, nuevo, DE, NOMBRES } from './instructor-ia-base.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fila = (materia, tema, bien, de, titulo = tema) => ({ id: `${materia}/${tema}`, materia, tema, titulo, bien, de, fallos: de - bien, peso: de - bien });
const palabras = texto => String(texto).split(/\s+/).filter(Boolean).length;

test('el alcance lo decide el código: un tema solo, varios de una materia o varias materias', () => {
  // Fallas juntas en Hipoxia; lo demás de Factores humanos va bien → solo ese tema.
  const uno = decidirAlcance([fila('fh', 'hipoxia', 2, 6, 'Hipoxia'), fila('fh', 'vision', 5, 5), fila('fh', 'estres', 4, 5), fila('met', 'nubes', 4, 4)]);
  assert.equal(uno.alcance, 'tema');
  assert.deepEqual(uno.elegidos.map(t => t.tema), ['hipoxia']);
  assert.deepEqual(uno.evidencia, { materia: 'fh', tema: 'Hipoxia', fallos: 4, de: 6, bien_otros: 2 });
  // Tres temas flojos de Factores humanos → repaso general de la materia.
  const varios = decidirAlcance([fila('fh', 'hipoxia', 2, 6), fila('fh', 'vision', 1, 4), fila('fh', 'estres', 1, 3), fila('met', 'nubes', 1, 2)]);
  assert.equal(varios.alcance, 'materia');
  assert.deepEqual(varios.evidencia, { materia: 'fh', n: 3 });
  assert.deepEqual(varios.elegidos.map(t => t.tema), ['hipoxia', 'vision', 'estres'], 'los que más pesan primero, hasta 3');
  // Uno flojo en cada materia → los 2 que más pesan.
  const dos = decidirAlcance([fila('fh', 'hipoxia', 1, 4), fila('met', 'nubes', 0, 2), fila('nav', 'cartas', 0, 1)]);
  assert.equal(dos.alcance, 'varias');
  assert.deepEqual(dos.elegidos.map(t => t.tema), ['hipoxia', 'nubes']);
  // Nada flojo (≥ 70 % en todo): sin consejo que pagar.
  assert.equal(decidirAlcance([fila('fh', 'hipoxia', 5, 6), fila('fh', 'vision', 4, 4)]), null);
});

test('el video sale solo de lo que ya existe: el de la materia, uno de YouTube del tema o de la materia, o el clip de una tarjeta', () => {
  const paquete = { materias: [{ id: 'fh', temas: [{ id: 'hipoxia', secciones: [{ titulo: 'Qué es' }, { titulo: 'Síntomas', clip: { archivo: 'c.mp4' } }] }, { id: 'vision', secciones: [] }] }] };
  const temas = [{ materia: 'fh', tema: 'hipoxia', tarjeta: 1 }];
  const yt = [{ materia: 'fh', tema: 'hipoxia', titulo: 'Hipoxia explicada', url: 'https://youtu.be/abcdefg' }, { materia: 'fh', tema: '', titulo: 'Factores humanos completo', url: 'https://youtu.be/hijklmn' }];
  assert.equal(elegirVideo(paquete, 'tema', temas, yt).titulo, 'Hipoxia explicada', 'un tema: su video');
  assert.equal(elegirVideo(paquete, 'materia', [...temas, { materia: 'fh', tema: 'vision' }], yt).titulo, 'Factores humanos completo', 'varios temas: el de la materia entera');
  const clip = elegirVideo(paquete, 'tema', temas, []);
  assert.deepEqual([clip.tipo, clip.tarjeta], ['clip', 2], 'sin YouTube: el clip de la tarjeta');
  assert.equal(elegirVideo(paquete, 'materia', temas, [{ materia: 'otra', tema: '', titulo: 'x', url: 'https://youtu.be/zzzzzzz' }]), null, 'de otra materia: ninguno');
  assert.match(elegirVideo(paquete, 'tema', temas, yt).id, /^yt-[a-f0-9]{12}$/);
  // Con el video de la materia: para la materia entera, desde el principio; para un tema, en su capítulo.
  const conVideo = { materias: [{ ...paquete.materias[0], video: { titulo: 'Factores humanos', escenas: [{ inicio_s: 0, fin_s: 10 }] } }] };
  const entero = elegirVideo(conVideo, 'materia', temas, yt);
  assert.deepEqual([entero.tipo, entero.tema], ['materia', null]);
  const capitulo = elegirVideo(conVideo, 'tema', temas, []);
  assert.deepEqual([capitulo.tipo, capitulo.tema], ['materia', 'hipoxia']);
  const ins = crearInstructor(ayudas());
  const enlace = v => ins.pintarConsejo({ forma: 2, saludo: 'x', temas: [], video: v, repaso: { n: 0 } }).todos(n => n.etiqueta === 'a')[0].atributos.href;
  assert.deepEqual([enlace(entero), enlace(capitulo), enlace(clip)], ['#video/fh', '#video/fh/tema/hipoxia', '#tema/fh/hipoxia/2']);
});

test('la respuesta de la IA: esquema, ids revisados (los inventados se descartan), palabras con tope, y nunca un muro', () => {
  const datos = { uso: 'instructor_consejo', forma: 2, temas: ['fh/hipoxia', 'fh/vision'], videoId: 'yt-aaaaaaaaaaaa' };
  assert.equal(esquemaDe(datos), ESQUEMA_CONSEJO);
  assert.notEqual(esquemaDe({ uso: 'instructor_consejo' }), ESQUEMA_CONSEJO, 'una tarea de antes sigue con su esquema');
  const largo = Array.from({ length: 90 }, (_, i) => `palabra${i}`).join(' ');
  const json = { saludo: largo, video_porque: largo, porque: largo, temas: [{ id: 'fh/hipoxia', confusion: largo }, { id: 'inventado/x', confusion: 'no' }, { id: 'fh/hipoxia', confusion: 'repetido' }, { id: 'fh/vision', confusion: 'Mirar directo de noche.' }] };
  assert.ok(cumpleEsquema(json, ESQUEMA_CONSEJO));
  assert.ok(!cumpleEsquema({ titulo: 'x', consejo: 'y', pasos: [] }, ESQUEMA_CONSEJO), 'la forma de antes no cumple el esquema nuevo');
  const r = revisarRespuesta(datos, json);
  assert.deepEqual(Object.keys(r.confusiones), ['fh/hipoxia', 'fh/vision']);
  assert.equal(r.confusiones['fh/vision'], 'Mirar directo de noche.');
  const visible = palabras(r.saludo) + palabras(r.videoPorque) + Object.values(r.confusiones).reduce((s, c) => s + palabras(c), 0);
  assert.ok(visible <= 60, `lo visible tiene ${visible} palabras`);
  assert.ok(palabras(r.porque) <= PALABRAS_CONSEJO.porque);
  // Sin video, sin porqué del video; y una respuesta vacía no se usa (se pagó y no sirvió).
  assert.equal(revisarRespuesta({ ...datos, videoId: null }, json).videoPorque, '');
  assert.throws(() => revisarRespuesta(datos, { saludo: '', video_porque: '', porque: '', temas: [] }), /no_se_pudo_guardar/);
  assert.equal(cortarPalabras('Uno dos tres. Cuatro cinco seis siete', 5), 'Uno dos tres.');
  // El pedido: el diagnóstico va como datos; el tono, de pana; nada de párrafos.
  const p = armarConsejo({ cifras: { alcance: 'tema', temas: [{ id: 'fh/hipoxia', tema: 'Hipoxia', bien: 2, de: 6 }] } });
  assert.match(p.sistema, /pana/);
  assert.match(p.sistema, /Nada de párrafos/);
  assert.match(p.texto, /"bien":2,"de":6/);
});

// ---------- La pantalla (un DOM de mentira) ----------
class Nodo {
  constructor(etiqueta) { this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.isConnected = true; }
  append(...xs) { for (const x of xs) this.hijos.push(x instanceof Nodo ? x : String(x)); }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
  todos(f, out = []) { if (f(this)) out.push(this); for (const h of this.hijos) if (h instanceof Nodo) h.todos(f, out); return out; }
}
function ayudas() {
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
  return { el, t, tn, talCual, numero: n => String(n), icono: () => el('svg'), nombreMateria: id => (id === 'fh' ? 'Factores humanos' : id), sonar: () => {}, empezarIntento: () => {}, textoError: x => x, avisar: () => {}, api: async () => ({ ok: false, datos: {} }), partirTitulo: s => ({ es: String(s).replace(/\s*\([^)]*\)\s*$/, '') }) };
}

test('la tarjeta: saludo, UN video, los temas con «2/6» y barrita, Estudiar · Practicar · Te guío, los repasos y «Por qué» plegado', () => {
  const ins = crearInstructor(ayudas());
  const guardado = { forma: 2, saludo: 'Bro, la hipoxia se te ha complicado un poquito. Te recomiendo esto:', videoId: 'yt-1', videoPorque: 'Explica la presión con dibujos.', confusiones: { 'fh/hipoxia': 'Confundes altitud con presión.' }, porque: 'Fallaste 4 de 6.' };
  const diag = {
    alcance: 'tema', evidencia: { materia: 'fh', tema: 'Hipoxia (hypoxia)', fallos: 4, de: 6, bien_otros: 2 },
    temas: [{ id: 'fh/hipoxia', materia: 'fh', tema: 'hipoxia', titulo: 'La hipoxia y sus tipos (hypoxia)', bien: 2, de: 6, ideas: ['no va a la pantalla'], tarjeta: 2 }],
    video: { id: 'yt-1', tipo: 'youtube', titulo: 'Hipoxia explicada', url: 'https://youtu.be/abcdefg', materia: 'fh', tema: 'hipoxia' },
    repaso: { n: 5 }, guia: { materia: 'fh', tema: 'hipoxia', tarjeta: 2 },
  };
  const vista = consejoParaVer(guardado, diag);
  assert.ok(!JSON.stringify(vista).includes('no va a la pantalla'), 'las ideas que vio la IA no viajan a la pantalla');
  const n = ins.pintarConsejo({ estado: 'lista', ...vista });
  const texto = n.textContent;
  assert.doesNotMatch(texto, /\bnull\b|\bundefined\b|NaN|\{[a-z_]+\}/);
  for (const x of ['Bro, la hipoxia', 'Video recomendado', 'Hipoxia explicada', 'Estos son los temas que fallaste:', '2/6', 'Confundes altitud', 'Estudiar', 'Practicar', 'Te guío', 'Repaso: tienes 5 pendientes', 'Por qué te lo recomiendo', 'Fallaste 4 de 6 en Hipoxia, pero vas bien en lo demás de Factores humanos']) assert.ok(texto.includes(x), x);
  const enlaces = n.todos(x => x.etiqueta === 'a').map(x => x.atributos.href);
  assert.deepEqual(enlaces, ['https://youtu.be/abcdefg', '#tema/fh/hipoxia', '#tema/fh/hipoxia/2'], 'el video, el tema y «Estudiar» en la tarjeta que lo explica');
  assert.equal(n.todos(x => x.etiqueta === 'button').length, 3, 'Practicar, Te guío y el repaso');
  assert.equal(n.todos(x => x.etiqueta === 'progress')[0].atributos.value, '2');
  assert.equal(n.todos(x => x.etiqueta === 'details').length, 1);
  assert.equal(n.todos(x => x.etiqueta === 'p' && /tal-cual/.test(x.atributos.class ?? '') && !/chica/.test(x.atributos.class)).length, 1, 'un solo renglón de texto (el saludo), sin párrafos');
  // Un video que ya no está (otro id): sin su porqué; sin video: sin la fila.
  assert.ok(!ins.pintarConsejo({ ...consejoParaVer({ ...guardado, videoId: 'yt-otro' }, diag) }).textContent.includes('con dibujos'));
  assert.ok(!ins.pintarConsejo({ ...consejoParaVer(guardado, { ...diag, video: null }) }).textContent.includes('Video recomendado'));
  // El texto se escribió para UN diagnóstico: con otros números, sin su porqué; con otros temas, sin saludo ni porqué.
  const numeros = consejoParaVer({ ...guardado, vio: [{ id: 'fh/hipoxia', bien: 1, de: 6 }] }, diag);
  assert.deepEqual([Boolean(numeros.saludo), numeros.porque], [true, '']);
  const otros = consejoParaVer({ ...guardado, vio: [{ id: 'fh/vision', bien: 1, de: 6 }] }, diag);
  assert.deepEqual([otros.saludo, otros.porque], ['', '']);
  assert.match(ins.pintarConsejo(otros).textContent, /Estuve mirando tus respuestas: La hipoxia/);
  assert.equal(consejoParaVer({ ...guardado, vio: [{ id: 'fh/hipoxia', bien: 2, de: 6 }] }, diag).porque, 'Fallaste 4 de 6.');
  // Superado: «vas bien» y sus repasos, nunca una tarjeta vacía.
  const bien = ins.pintarConsejo(consejoParaVer(guardado, { ...diag, temas: [], video: null, guia: null }));
  assert.match(bien.textContent, /Vas bien.*Repaso: tienes 5 pendientes/);
  // El de antes (titulo, consejo, pasos) se sigue viendo.
  const viejo = ins.pintarConsejo({ estado: 'lista', titulo: 'Tu semana', consejo: 'Repasa la hipoxia.', pasos: ['Relee.'] });
  assert.match(viejo.textContent, /Tu semana.*Repasa la hipoxia.*Relee/);
});

test('con el servidor: el consejo guardado de antes no vuelve a salir (se pide el nuevo), y nada personal va a la IA', async () => {
  await conInstructor(async c => {
    const x = await unaMala(c, c.z);
    const id = c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'zoelia'").get().id;
    const { semanaDe } = await import('../src/api/instructor.js');
    c.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(`academia.ia.consejo.${id}.${semanaDe(Date.now())}`, JSON.stringify({ titulo: 'Viejo', consejo: 'Un muro de texto.', pasos: [] }), new Date().toISOString());
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.z })).datos.consejoIa, null, 'el muro de antes ya no se muestra');
    c.falso.siguiente({ tipo: 'ok', json: { saludo: 'Dale, pana: la hipoxia primero.', video_porque: '', temas: [{ id: 'factores_humanos/muestra-hipoxia', confusion: 'Altitud y presión.' }], porque: 'Fallaste 1 de 1.' } });
    const k = (await pedir(c.base, 'POST', '/api/academia/instructor/consejo', { galleta: c.z, datos: {} })).datos;
    assert.equal(k.ia.estado, 'pendiente');
    await c.hacer(k.ia.tarea);
    const lista = (await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${k.ia.tarea}`, { galleta: c.z })).datos;
    assert.deepEqual([lista.estado, lista.forma, lista.saludo, lista.temas[0].confusion], ['lista', 2, 'Dale, pana: la hipoxia primero.', 'Altitud y presión.']);
    for (const nombre of [...NOMBRES, 'junior']) assert.ok(!textoDe(pedidosIa(c)[0]).toLowerCase().includes(nombre));
    const enviado = textoDe(pedidosIa(c)[0]);
    assert.match(enviado, /alcance/, 'el diagnóstico (alcance, evidencia) va como dato');
    // «Practicar» (lo que falló de ese tema; si ya no queda, la práctica del instructor de ese tema) y su respaldo.
    const lugar = { materia: 'factores_humanos', tema: 'muestra-hipoxia' };
    const errores = await nuevo(c, c.z, { tipo: 'errores', ...lugar });
    assert.ok(errores.codigo < 300 || errores.datos.error === 'sin_errores', JSON.stringify(errores.datos));
    assert.ok((await nuevo(c, c.z, { tipo: 'instructor', ...lugar })).codigo < 300);
    // El consejo de un intento suyo ya terminado (la consulta de sus errores corre de verdad).
    c.db.prepare("UPDATE academia_intentos SET terminado_en = ? WHERE id = ?").run(new Date().toISOString(), x.intento.id); // terminado (sin responder las demás)
    c.falso.siguiente({ tipo: 'ok', json: { saludo: 'Dale con la hipoxia.', video_porque: '', temas: [{ id: 'factores_humanos/muestra-hipoxia', confusion: 'Presión.' }], porque: 'Ese examen.' } });
    const ex = await pedir(c.base, 'POST', '/api/academia/instructor/consejo', { galleta: c.z, datos: { examen: x.intento.id } });
    assert.equal(ex.codigo, 200);
    assert.equal(ex.datos.ia.estado, 'pendiente');
    // Ya la respondió bien: el consejo no se contradice («vas bien», sin el saludo de antes ni temas).
    const otra = (await nuevo(c, c.z, { tipo: 'tema', ...lugar })).datos;
    assert.equal((await pedir(c.base, 'POST', `/api/academia/intentos/${otra.id}/responder`, { galleta: c.z, datos: { pregunta: x.pregunta.id, elegida: DE(x.pregunta.id).original.correcta } })).codigo, 200);
    const ahora = (await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.z })).datos.consejoIa;
    assert.deepEqual([ahora.superado, ahora.saludo, ahora.temas.length], [true, '', 0]);
  });
});
