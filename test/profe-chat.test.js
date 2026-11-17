// Academia 0.14.22: el Profesor virtual conoce la historia del alumno (src/academia/profe-chat.js, la parte del chat de
// src/academia/instructor-ia.js y src/api/instructor.js, y pintarProfe de public/instructor.js). Todo con el proveedor
// FALSO o sin IA: determinista.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contradicciones, historialEstudio, validarBoton, validarBotones, profe, cifrasProfe, respuestaSinIa, PESO_EXAMEN } from '../src/academia/profe-chat.js';
import { armarChat } from '../src/academia/instructor-ia.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { darProfesor } from '../src/academia/profesor.js';
import { crearInstructor } from '../public/instructor.js';
import { conInstructor, pedir, pedidosIa, textoDe, DE, NOMBRES, datosDe, cuerpoDe, sistemaDe } from './instructor-ia-base.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID_INTERNO = /factores_humanos|muestra-|\bm\d{2}\b|\btg-\d/;
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const mal = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);

// Un intento terminado con sus respuestas (directo en la base: así las cifras son exactas).
function intento(db, usuarioId, { tipo, materia = 'factores_humanos', tema = null, respuestas, aprobado = null, en = new Date().toISOString() }) {
  const aciertos = respuestas.filter(([, bien]) => bien).length;
  const id = db.prepare('INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(usuarioId, tipo, materia, tema, respuestas.length, respuestas.length, aciertos, aprobado, en, en).lastInsertRowid;
  for (const [pregunta, bien] of respuestas) {
    db.prepare('INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, usuarioId, pregunta, materia, 'muestra-hipoxia', bien ? DE(pregunta).original.correcta : mal(pregunta), bien ? 1 : 0, en.slice(0, 10), en);
  }
  return Number(id);
}
// Hipoxia: fallada en las prácticas (0/4) y bien en el examen de la materia (4/4).
function sembrarContradiccion(c, usuarioId) {
  const qs = ['muestra-h1', 'muestra-h2', 'muestra-h3', 'muestra-h4'];
  intento(c.db, usuarioId, { tipo: 'instructor', tema: 'muestra-hipoxia', respuestas: qs.map(q => [q, false]) });
  intento(c.db, usuarioId, { tipo: 'examen', respuestas: qs.map(q => [q, true]), aprobado: 0 });
}

const tema = (titulo, estudio, examen) => ({ materia: 'fh', tema: titulo.toLowerCase(), titulo, estudio, examen, practica: estudio, test: { bien: 0, de: 0 } });
test('lo que no cuadra: en las dos direcciones, con suficientes respuestas, lo más distinto primero', () => {
  const h = { materias: [{ materia: 'fh', temas: [
    tema('Hipoxia', { bien: 1, de: 4 }, { bien: 4, de: 4 }),
    tema('Vision', { bien: 5, de: 5 }, { bien: 0, de: 3 }),
    tema('Estres', { bien: 0, de: 1 }, { bien: 3, de: 3 }), // una sola práctica: no se acusa
    tema('Ruido', { bien: 4, de: 4 }, { bien: 4, de: 4 }),
  ] }] };
  const c = contradicciones(h);
  assert.deepEqual(c.map(x => [x.titulo, x.tipo]), [['Vision', 'practica_bien_examen_mal'], ['Hipoxia', 'practica_mal_examen_bien']]);
  assert.deepEqual(c[1].estudio, { bien: 1, de: 4 });
  // Sin IA: la primera línea lo dice con sus números.
  const lineas = respuestaSinIa({ ...h, diagnostico: null, repasos: 3, oral: null, haceDias: 0 }, c);
  assert.deepEqual(lineas[0], { clave: 'profe.contra.practica_bien_examen_mal', vars: { tema: 'Vision', sbien: 5, sde: 5, ebien: 0, ede: 3 } });
  assert.ok(lineas.some(l => l.clave === 'profe.repaso' && l.vars.n === 3));
});

test('con la base: la historia por tema pesa el examen más que la práctica, y los botones se revisan (nada cerrado ni inventado)', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    sembrarContradiccion(c, z);
    const p = paqueteActivo(c.db, c.config);
    const h = historialEstudio(c.db, z, p);
    const t = h.materias[0].temas.find(x => x.tema === 'muestra-hipoxia');
    assert.deepEqual([t.practica, t.examen], [{ bien: 0, de: 4 }, { bien: 4, de: 4 }]);
    assert.equal(t.dominio, Math.round((100 * PESO_EXAMEN * 4) / (PESO_EXAMEN * 4 + 4)), 'el examen pesa 3 veces: 75 %, no 50 %');
    assert.ok(t.dominio > 50);
    assert.equal(h.materias[0].examen.veces, 1);
    assert.equal(h.haceDias, 0);
    const x = profe(c.db, z, p);
    assert.equal(x.contradicciones[0].tipo, 'practica_mal_examen_bien');
    assert.deepEqual(x.botones.slice(0, 2).map(b => [b.tipo, b.tema]), [['practicar', 'muestra-hipoxia'], ['test', 'muestra-hipoxia']], 'directo a confirmar con práctica');
    // Revisión: un tema cerrado, una materia inventada, un tipo raro, una ruta con trampa o un repaso que no hay: fuera.
    assert.equal(validarBoton({ tipo: 'clase', materia: 'factores_humanos', tema: 'muestra-ilusiones' }, p, h), null, 'tema bloqueado');
    assert.equal(validarBoton({ tipo: 'examen', materia: 'inventada' }, p, h), null);
    assert.equal(validarBoton({ tipo: 'borrar', materia: 'factores_humanos' }, p, h), null);
    assert.equal(validarBoton({ tipo: 'clase', materia: '../x', tema: 'muestra-hipoxia' }, p, h), null);
    assert.equal(validarBoton({ tipo: 'repaso' }, p, { ...h, repasos: 0 }), null);
    assert.equal(validarBoton({ tipo: 'oral', errores: true }, p, h), null, 'sin oral en el paquete');
    assert.deepEqual(validarBoton({ tipo: 'clase', materia: 'factores_humanos', tema: 'muestra-hipoxia', tarjeta: 99, extra: 'x' }, p, h), { tipo: 'clase', materia: 'factores_humanos', tema: 'muestra-hipoxia', titulo: 'La hipoxia (muestra)' }, 'solo campos conocidos; tarjeta que no existe, fuera');
    assert.equal(validarBotones([{ tipo: 'test', materia: 'factores_humanos', tema: 'muestra-hipoxia' }, { tipo: 'test', materia: 'factores_humanos', tema: 'muestra-hipoxia' }], p, h).length, 1, 'sin repetidos');
    // Lo que va a la IA: títulos y números, nunca un id interno ni un nombre.
    const cifras = JSON.stringify(cifrasProfe(x));
    assert.doesNotMatch(cifras, ID_INTERNO);
    for (const n of [...NOMBRES, 'junior']) assert.ok(!cifras.toLowerCase().includes(n));
    assert.match(cifras, /La hipoxia \(muestra\)/);
    assert.match(cifras, /"peso_examen":3/);
    const pedido = armarChat({ alumno: {}, material: null, mensaje: '¿Cómo voy?', estudio: cifrasProfe(x) });
    assert.match(pedido.sistema, /contradicciones/);
    assert.match(pedido.sistema, /dominicano/);
    assert.match(pedido.sistema, /El EXAMEN es lo que más pesa/);
    assert.deepEqual(datosDe(pedido.texto).estudio.contradicciones[0].examen, { bien: 4, de: 4 });
  });
});

test('con IA (proveedor falso): la historia va a la IA, los botones salen revisados con su respuesta y nada personal se manda', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    darProfesor(c.db, z, true);
    sembrarContradiccion(c, z);
    c.falso.siguiente({ tipo: 'ok', json: { respuesta: 'Klk, piloto. Vi que fallaste en las prácticas de La hipoxia, pero en el examen te fue bien: ¿seguro que lo dominas?', pregunta_control: '¿Qué baja con la altura?', estudiar_ahora: 'La hipoxia', buscar_en_youtube: [], terminos: [], cita_test_guide: [] } });
    const r = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Cómo voy con todo?' } })).datos;
    assert.equal(r.ia.estado, 'pendiente');
    assert.equal(r.profe.botones[0].tipo, 'practicar');
    await c.hacer(r.ia.tarea);
    const cuerpo = cuerpoDe(pedidosIa(c).at(-1));
    assert.match(sistemaDe(cuerpo), /botones_que_pone_la_app/);
    const enviado = datosDe(cuerpo.messages[0].content);
    assert.equal(enviado.estudio.contradicciones[0].tipo, 'practica_mal_examen_bien');
    assert.doesNotMatch(JSON.stringify(enviado.estudio), ID_INTERNO, 'su historia va sin ids internos');
    for (const n of [...NOMBRES, 'junior']) assert.ok(!textoDe(pedidosIa(c).at(-1)).toLowerCase().includes(n));
    const m = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos.historial.at(-1);
    assert.equal(m.estado, 'lista');
    assert.deepEqual(m.profe.botones.map(b => b.tipo).slice(0, 2), ['practicar', 'test']);
    // Un botón guardado que ya no vale (lo metieron a mano en el historial) no vuelve a la pantalla.
    const clave = `academia.profesor.historial.${z}`;
    const hist = JSON.parse(c.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave).valor);
    hist.at(-1).profe.botones.push({ tipo: 'clase', materia: 'factores_humanos', tema: 'muestra-ilusiones' }, { tipo: 'examen', materia: 'otra' });
    c.db.prepare('UPDATE ajustes SET valor = ? WHERE clave = ?').run(JSON.stringify(hist), clave);
    const otra = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos;
    assert.ok(otra.historial.at(-1).profe.botones.every(b => b.tema !== 'muestra-ilusiones' && b.materia !== 'otra'));
    assert.equal(otra.profe.lineas[0].clave, 'profe.contra.practica_mal_examen_bien', 'arriba del chat, lo que leyó (sin IA)');
  }, { modelo: 'claude-haiku-5-5' });
});

test('sin IA: la misma lectura y los mismos botones, sin llamar a nadie', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    darProfesor(c.db, z, true);
    sembrarContradiccion(c, z);
    const antes = pedidosIa(c).length;
    const r = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Qué estudio hoy?' } })).datos;
    assert.notEqual(r.instructor.modo, 'ia');
    assert.equal(pedidosIa(c).length, antes, 'nada va a la IA');
    assert.equal(r.profe.lineas[0].clave, 'profe.contra.practica_mal_examen_bien');
    assert.deepEqual(r.profe.botones.slice(0, 2).map(b => b.tipo), ['practicar', 'test']);
    const m = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos.historial.at(-1);
    assert.equal(m.estado, 'basico');
    assert.equal(m.profe.lineas[0].vars.tema, 'La hipoxia (muestra)');
  }, { encender: false });
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
  return { el, t, tn, talCual, numero: n => String(n), icono: () => el('svg'), nombreMateria: id => (id === 'factores_humanos' ? 'Factores humanos' : id), sonar: () => {}, empezarIntento: () => {}, textoError: x => x, avisar: () => {}, api: async () => ({ ok: false, datos: {} }), partirTitulo: s => ({ es: String(s).replace(/\s*\([^)]*\)\s*$/, '') }) };
}

test('la pantalla: la contradicción dicha en dominicano, botones con su destino armado aquí y ningún id a la vista', () => {
  const ins = crearInstructor(ayudas());
  const p = {
    lineas: [{ clave: 'profe.contra.practica_mal_examen_bien', vars: { tema: 'La hipoxia (hypoxia)', sbien: 0, sde: 4, ebien: 4, ede: 4 } }, { clave: 'profe.examen.no', vars: { materia: 'factores_humanos', pct: 60 } }, { clave: 'profe.repaso', vars: { n: 1 } }],
    botones: [
      { tipo: 'practicar', materia: 'factores_humanos', tema: 'muestra-hipoxia', titulo: 'La hipoxia (hypoxia)' },
      { tipo: 'clase', materia: 'factores_humanos', tema: 'muestra-hipoxia', titulo: 'La hipoxia (hypoxia)', tarjeta: 2 },
      { tipo: 'examen', materia: 'factores_humanos' }, { tipo: 'oral', errores: true }, { tipo: 'repaso', n: 1 },
      { tipo: 'clase', materia: 'javascript:alert(1)', tema: 'x' }, { tipo: 'raro' },
    ],
  };
  const n = ins.pintarProfe(p, { lineas: true });
  const texto = n.textContent;
  assert.match(texto, /Vi que fallaste en las prácticas de La hipoxia \(0\/4\), pero en el examen te fue bien \(4\/4\)\. ¿Seguro que lo dominas\?/);
  assert.match(texto, /El examen de Factores humanos todavía no lo pasaste/);
  assert.match(texto, /hoy te toca 1 repaso/);
  assert.doesNotMatch(texto, ID_INTERNO);
  assert.doesNotMatch(texto, /\bnull\b|\bundefined\b|NaN|\{[a-z_]+\}/);
  const hrefs = n.todos(x => x.etiqueta === 'a').map(x => x.atributos.href);
  assert.deepEqual(hrefs, ['#tema/factores_humanos/muestra-hipoxia/2', '#examen/factores_humanos', '#oral/practica/errores']);
  assert.equal(n.todos(x => x.etiqueta === 'button').length, 2, 'Practicar y el repaso; lo raro no sale');
  // Debajo de una respuesta de la IA: solo los botones.
  assert.equal(ins.pintarProfe({ lineas: p.lineas, botones: p.botones.slice(0, 1) }).todos(x => /profe-lineas/.test(x.atributos.class ?? '')).length, 0);
  assert.equal(ins.pintarProfe({ lineas: [], botones: [] }), null);
});
